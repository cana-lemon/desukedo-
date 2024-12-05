// Firebase を使用したリアルタイム同期の拡張スクリプト
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, push, update, remove } from 'firebase/database';

// Firebase の設定 (あなたの Firebase プロジェクトの設定に置き換えてください)
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    databaseURL: "YOUR_DATABASE_URL",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Firebase アプリの初期化
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// アプリケーションの状態管理
const state = {
    groups: new Map(),
    currentGroup: null,
    currentUser: null,
    participants: new Map(),
    timers: {
        total: 0,
        individual: new Map(),
        interval: null
    },
    currentSpeaker: null,
    notes: new Map(),
    reactions: new Map()
};

// リアルタイム同期関数
function syncGroupData(groupName) {
    const groupRef = ref(database, 'groups/' + groupName);

    // グループデータのリアルタイム監視
    onValue(groupRef, (snapshot) => {
        const groupData = snapshot.val();
        if (groupData) {
            // 参加者の同期
            state.participants.clear();
            Object.values(groupData.participants || {}).forEach(participant => {
                state.participants.set(participant.id, participant);
            });

            // タイマーの同期
            if (groupData.timers) {
                state.timers.total = groupData.timers.total || 0;
                state.timers.individual.clear();
                Object.entries(groupData.timers.individual || {}).forEach(([id, time]) => {
                    state.timers.individual.set(id, time);
                });
            }

            // 現在の話者の同期
            state.currentSpeaker = groupData.currentSpeaker;

            // リアクションの同期
            state.reactions.clear();
            Object.entries(groupData.reactions || {}).forEach(([participantId, reactions]) => {
                state.reactions.set(participantId, reactions);
            });

            // UIの更新
            updateTimerDisplays();
            updateParticipantsList();
        }
    });
}

// グループ作成（Firebase版）
function createGroup() {
    const groupName = document.getElementById('createGroupName').value;
    const password = document.getElementById('createPassword').value;
    const userName = document.getElementById('createUserName').value;

    // 入力バリデーション（以前のコードと同様）
    if (!groupName || !password || !userName) {
        showError('createError', 'すべての項目を入力してください');
        return;
    }

    if (!/^\d{4}$/.test(password)) {
        showError('createError', 'パスワードは4桁の数字を入力してください');
        return;
    }

    // ユーザー情報の作成
    const userId = Date.now().toString();
    const newUser = {
        id: userId,
        name: userName,
        isAdmin: true,
        joinedAt: new Date().toISOString()
    };

    // グループデータの作成
    const groupData = {
        name: groupName,
        password: password,
        createdAt: new Date().toISOString(),
        participants: {},
        timers: {
            total: 0,
            individual: {}
        }
    };

    // 最初の参加者として追加
    groupData.participants[userId] = newUser;

    // Firebaseにグループを保存
    const groupRef = ref(database, 'groups/' + groupName);
    set(groupRef, groupData)
        .then(() => {
            // ローカルステートの更新
            state.currentUser = newUser;
            state.currentGroup = groupName;
            
            // リアルタイム同期の開始
            syncGroupData(groupName);

            // 会議画面への遷移
            initializeMeeting();
        })
        .catch((error) => {
            showError('createError', 'グループ作成に失敗しました: ' + error.message);
        });
}

// グループ参加（Firebase版）
function joinGroup() {
    const groupName = document.getElementById('joinGroupName').value;
    const password = document.getElementById('joinPassword').value;
    const userName = document.getElementById('joinUserName').value;

    // 入力バリデーション
    if (!groupName || !password || !userName) {
        showError('joinError', 'すべての項目を入力してください');
        return;
    }

    const groupRef = ref(database, 'groups/' + groupName);
    
    // グループ情報の取得と検証
    onValue(groupRef, (snapshot) => {
        const groupData = snapshot.val();
        
        if (!groupData) {
            showError('joinError', '指定されたグループは存在しません');
            return;
        }

        if (groupData.password !== password) {
            showError('joinError', 'パスワードが間違っています');
            return;
        }

        // ユーザー情報の作成
        const userId = Date.now().toString();
        const newUser = {
            id: userId,
            name: userName,
            isAdmin: false,
            joinedAt: new Date().toISOString()
        };

        // 参加者の追加
        const updatedParticipants = {
            ...groupData.participants,
            [userId]: newUser
        };

        // グループデータの更新
        update(groupRef, {
            participants: updatedParticipants
        }).then(() => {
            // ローカルステートの更新
            state.currentUser = newUser;
            state.currentGroup = groupName;
            
            // リアルタイム同期の開始
            syncGroupData(groupName);

            // 会議画面への遷移
            initializeMeeting();
        }).catch((error) => {
            showError('joinError', '参加に失敗しました: ' + error.message);
        });
    }, {
        onlyOnce: true
    });
}

// 発言開始/終了（Firebase同期版）
function toggleSpeaking() {
    if (!state.currentGroup || !state.currentUser) return;

    const groupRef = ref(database, 'groups/' + state.currentGroup);
    
    if (state.currentSpeaker === state.currentUser.id) {
        // 発言終了
        update(groupRef, {
            currentSpeaker: null
        });
        stopTimer();
    } else {
        // 発言開始
        update(groupRef, {
            currentSpeaker: state.currentUser.id
        });
        startTimer();
    }
}

// タイマー開始（Firebase同期版）
function startTimer() {
    if (state.timers.interval) return;
    
    state.timers.interval = setInterval(() => {
        if (state.currentSpeaker && state.currentGroup) {
            // ローカルタイマーの更新
            state.timers.total++;
            const speakerTimer = (state.timers.individual.get(state.currentSpeaker) || 0) + 1;
            state.timers.individual.set(state.currentSpeaker, speakerTimer);

            // Firebase上のタイマーの更新
            const groupRef = ref(database, 'groups/' + state.currentGroup);
            update(groupRef, {
                'timers/total': state.timers.total,
                [`timers/individual/${state.currentSpeaker}`]: speakerTimer
            });

            updateTimerDisplays();
        }
    }, 1000);
}

// リアクション追加（Firebase同期版）
function addReaction(participantId, type) {
    if (!state.currentGroup || !state.currentUser) return;

    const groupRef = ref(database, 'groups/' + state.currentGroup);
    const reactionRef = push(ref(database, `groups/${state.currentGroup}/reactions/${participantId}`));

    set(reactionRef, {
        type: type,
        timestamp: new Date().toISOString(),
        from: state.currentUser.id,
        fromName: state.currentUser.name
    });
}

// メモの更新（Firebase同期版）
function updateNote(event) {
    const noteContent = event.target.value;
    if (state.currentGroup) {
        const groupRef = ref(database, 'groups/' + state.currentGroup);
        update(groupRef, {
            sharedNote: noteContent
        });
    }
}

// UIの更新関数（以前のコードをベースに）
function updateTimerDisplays() {
    document.getElementById('totalTimer').textContent = formatTime(state.timers.total);
    if (state.currentUser) {
        const personalTime = state.timers.individual.get(state.currentUser.id) || 0;
        document.getElementById('personalTimer').textContent = formatTime(personalTime);
    }
}

function updateParticipantsList() {
    const grid = document.getElementById('participantsGrid');
    grid.innerHTML = '';

    state.participants.forEach((participant, id) => {
        if (id !== state.currentUser.id) {
            const card = document.createElement('div');
            card.className = `participant-card ${id === state.currentSpeaker ? 'speaking' : ''}`;
            
            const time = state.timers.individual.get(id) || 0;
            const reactions = Array.from(state.reactions.get(id) || []);
            
            card.innerHTML = `
                <div class="card-header">
                    <h3>${participant.name}</h3>
                    <div class="timer-display">${formatTime(time)}</div>
                </div>
                <div class="reaction-buttons">
                    <button onclick="addReaction('${id}', 'thumbsUp')" class="reaction-button">
                        👍 <span class="reaction-count">${countReactions(id, 'thumbsUp')}</span>
                    </button>
                    <button onclick="addReaction('${id}', 'thumbsDown')" class="reaction-button">
                        👎 <span class="reaction-count">${countReactions(id, 'thumbsDown')}</span>
                    </button>
                    <button onclick="addReaction('${id}', 'question')" class="reaction-button">
                        ❓ <span class="reaction-count">${countReactions(id, 'question')}</span>
                    </button>
                </div>
            `;
            
            grid.appendChild(card);
        }
    });
}

function countReactions(participantId, type) {
    const reactions = state.reactions.get(participantId) || [];
    return reactions.filter(r => r.type === type).length;
}

// その他のユーティリティ関数（以前のコードから）
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function showError(id, message) {
    const errorDiv = document.getElementById(id);
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 3000);
}

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}View`).classList.add('active');
}

// 初期化とイベントリスナーの設定
function initializeMeeting() {
    switchView('meeting');
    updateTimerDisplays();
    updateParticipantsList();
    
    const noteArea = document.getElementById('sharedNote');
    noteArea.addEventListener('input', updateNote);
}

// イベントリスナーの追加
document.addEventListener('DOMContentLoaded', () => {
    // ボタンにイベントリスナーを追加
    document.getElementById('createGroupBtn').addEventListener('click', createGroup);
    document.getElementById('joinGroupBtn').addEventListener('click', joinGroup);
    document.getElementById('speakButton').addEventListener('click', toggleSpeaking);
    document.getElementById('endMeetingBtn').addEventListener('click', endMeeting);
    
    // 初期ビューの設定
    switchView('login');
});

// その他の関数（generateStats, saveStats, startNewMeeting等）は以前のコードを基に実装


// Modifications to existing timer.script.js

// Add WebSocket connection for real-time synchronization
let socket;

function initializeWebSocket() {
    // Replace with your WebSocket server URL
    socket = new WebSocket('ws://your-websocket-server-url');

    socket.onopen = function(e) {
        console.log('WebSocket connection established');
        // Send group join message
        if (state.currentGroup && state.currentUser) {
            socket.send(JSON.stringify({
                type: 'joinGroup',
                groupName: state.currentGroup,
                userId: state.currentUser.id,
                userName: state.currentUser.name
            }));
        }
    };

    socket.onmessage = function(event) {
        const data = JSON.parse(event.data);

        switch(data.type) {
            case 'timerUpdate':
                handleTimerUpdate(data);
                break;
            case 'speakerUpdate':
                handleSpeakerUpdate(data);
                break;
            case 'reactionUpdate':
                handleReactionUpdate(data);
                break;
        }
    };

    socket.onerror = function(error) {
        console.log('WebSocket Error: ', error);
    };
}

function handleTimerUpdate(data) {
    // Synchronize timer across all participants in the group
    state.timers.total = data.totalTime;
    state.timers.individual = new Map(Object.entries(data.individualTimes));
    updateTimerDisplays();
    updateParticipantsList();
}

function handleSpeakerUpdate(data) {
    // Update current speaker status
    state.currentSpeaker = data.speakerId;
    const button = document.getElementById('speakButton');
    
    if (state.currentSpeaker) {
        button.textContent = '発言終了';
        button.classList.add('speaking');
        startTimer();
    } else {
        button.textContent = '発言開始';
        button.classList.remove('speaking');
        stopTimer();
    }
    
    updateParticipantsList();
}

function handleReactionUpdate(data) {
    // Update reactions for a specific participant
    state.reactions.set(data.participantId, data.reactions);
    updateParticipantsList();
}

// Modify existing toggleSpeaking function
function toggleSpeaking() {
    const button = document.getElementById('speakButton');
    
    if (state.currentSpeaker === state.currentUser.id) {
        // 発言終了
        state.currentSpeaker = null;
        button.textContent = '発言開始';
        button.classList.remove('speaking');
        stopTimer();

        // Broadcast speaker update
        if (socket) {
            socket.send(JSON.stringify({
                type: 'speakerUpdate',
                groupName: state.currentGroup,
                speakerId: null
            }));
        }
    } else {
        // 発言開始
        state.currentSpeaker = state.currentUser.id;
        button.textContent = '発言終了';
        button.classList.add('speaking');
        startTimer();

        // Broadcast speaker update
        if (socket) {
            socket.send(JSON.stringify({
                type: 'speakerUpdate',
                groupName: state.currentGroup,
                speakerId: state.currentSpeaker
            }));
        }
    }
    
    updateParticipantsList();
}

// Modify startTimer to broadcast timer updates
function startTimer() {
    if (state.timers.interval) return;
    
    state.timers.interval = setInterval(() => {
        if (state.currentSpeaker) {
            state.timers.total++;
            const speakerTimer = state.timers.individual.get(state.currentSpeaker) || 0;
            state.timers.individual.set(state.currentSpeaker, speakerTimer + 1);
            updateTimerDisplays();

            // Broadcast timer update
            if (socket) {
                socket.send(JSON.stringify({
                    type: 'timerUpdate',
                    groupName: state.currentGroup,
                    totalTime: state.timers.total,
                    individualTimes: Object.fromEntries(state.timers.individual)
                }));
            }
        }
    }, 1000);
}

// Modify addReaction to broadcast reactions
function addReaction(participantId, type) {
    if (!state.reactions.has(participantId)) {
        state.reactions.set(participantId, []);
    }
    
    const newReaction = {
        type: type,
        timestamp: new Date(),
        from: state.currentUser.id
    };
    
    state.reactions.get(participantId).push(newReaction);
    
    // Broadcast reaction update
    if (socket) {
        socket.send(JSON.stringify({
            type: 'reactionUpdate',
            groupName: state.currentGroup,
            participantId: participantId,
            reactions: state.reactions.get(participantId)
        }));
    }
    
    updateParticipantsList();
}

// Modify initializeMeeting to set up WebSocket
function initializeMeeting() {
    switchView('meeting');
    updateTimerDisplays();
    updateParticipantsList();
    
    const noteArea = document.getElementById('sharedNote');
    noteArea.value = state.notes.get(state.currentGroup) || '';
    noteArea.addEventListener('input', updateNote);

    // Initialize WebSocket connection
    initializeWebSocket();
}

// Modify existing code to clear timers when starting a new meeting
function startNewMeeting() {
    if (confirm('新しいミーティングを開始しますか？')) {
        // Close WebSocket connection if it exists
        if (socket) {
            socket.close();
        }
        
        // Reset state
        state.timers = {
            total: 0,
            individual: new Map(),
            interval: null
        };
        state.currentSpeaker = null;
        state.reactions.clear();

        location.reload();
    }
}

// Additional helper function for enhanced reactions
function getReactionEmoji(type) {
    switch(type) {
        case 'thumbsUp': return '👍';
        case 'thumbsDown': return '👎';
        case 'question': return '❓';
        default: return '🤔';
    }
}

// Modify updateParticipantsList to show detailed reactions
function updateParticipantsList() {
    const grid = document.getElementById('participantsGrid');
    grid.innerHTML = '';

    const group = state.groups.get(state.currentGroup);
    if (!group) return;

    group.participants.forEach((participant, id) => {
        if (id !== state.currentUser.id) {
            const card = document.createElement('div');
            card.className = `participant-card ${id === state.currentSpeaker ? 'speaking' : ''}`;
            
            const time = state.timers.individual.get(id) || 0;
            const reactions = state.reactions.get(id) || [];
            
            // Organize reactions by type
            const reactionCounts = {
                'thumbsUp': 0,
                'thumbsDown': 0,
                'question': 0
            };
            const reactionDetails = {};

            reactions.forEach(reaction => {
                if (!reactionDetails[reaction.type]) {
                    reactionDetails[reaction.type] = [];
                }
                reactionDetails[reaction.type].push({
                    from: group.participants.get(reaction.from)?.name || 'Unknown',
                    timestamp: new Date(reaction.timestamp).toLocaleTimeString()
                });
                reactionCounts[reaction.type]++;
            });

            card.innerHTML = `
                <div class="card-header">
                    <h3>${participant.name}</h3>
                    <div class="timer-display">${formatTime(time)}</div>
                </div>
                <div class="reaction-buttons">
                    ${Object.entries(reactionCounts).map(([type, count]) => `
                        <button onclick="addReaction('${id}', '${type}')" class="reaction-button">
                            ${getReactionEmoji(type)} <span class="reaction-count">${count}</span>
                        </button>
                    `).join('')}
                </div>
                ${Object.entries(reactionDetails).map(([type, details]) => details.length > 0 ? `
                    <div class="reaction-details">
                        <strong>${getReactionEmoji(type)} ${type} リアクション:</strong>
                        <ul>
                            ${details.map(detail => `
                                <li>From: ${detail.from} (${detail.timestamp})</li>
                            `).join('')}
                        </ul>
                    </div>
                ` : '').join('')}
            `;
            
            grid.appendChild(card);
        }
    });
}
