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
