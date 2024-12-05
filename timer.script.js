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
    reactions: new Map(),
    messages: new Map(), // グループごとのメッセージを保存
    lastUpdate: null
};

// タイトル画面からアプリを開始
function startApp() {
    switchView('login');
}

// ユーティリティ関数
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

function formatDateTime(date) {
    return new Intl.DateTimeFormat('ja-JP', {
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}View`).classList.add('active');

    // ナビゲーションボタンの状態更新
    if (document.getElementById('mainNav')) {
        document.querySelectorAll('.nav-button').forEach(button => {
            button.classList.remove('active');
            if (button.onclick.toString().includes(viewName)) {
                button.classList.add('active');
            }
        });
    }

    // チャット画面が表示されたらスクロールを最下部に
    if (viewName === 'chat') {
        scrollChatToBottom();
        updateMemberList();
    }
}

// グループ管理機能
function createGroup() {
    const groupName = document.getElementById('createGroupName').value;
    const password = document.getElementById('createPassword').value;
    const userName = document.getElementById('createUserName').value;

    if (!groupName || !password || !userName) {
        showError('createError', 'すべての項目を入力してください');
        return;
    }

    if (!/^\d{4}$/.test(password)) {
        showError('createError', 'パスワードは4桁の数字を入力してください');
        return;
    }

    if (state.groups.has(groupName)) {
        showError('createError', 'このグループ名は既に使用されています');
        return;
    }

    // グループ情報を作成
    const newGroup = {
        password: password,
        participants: new Map(),
        createdAt: new Date(),
        messages: []
    };

    // ユーザー情報を設定
    state.currentUser = {
        id: Date.now(),
        name: userName,
        isAdmin: true
    };

    state.groups.set(groupName, newGroup);
    state.currentGroup = groupName;
    newGroup.participants.set(state.currentUser.id, state.currentUser);
    state.participants = newGroup.participants;

    // システムメッセージを追加
    addSystemMessage(`${userName}さんがグループを作成しました`);

    initializeMeeting();
}

function joinGroup() {
    const groupName = document.getElementById('joinGroupName').value;
    const password = document.getElementById('joinPassword').value;
    const userName = document.getElementById('joinUserName').value;

    if (!groupName || !password || !userName) {
        showError('joinError', 'すべての項目を入力してください');
        return;
    }

    const group = state.groups.get(groupName);
    if (!group || group.password !== password) {
        showError('joinError', 'グループ名またはパスワードが正しくありません');
        return;
    }

    // ユーザー情報を設定
    state.currentUser = {
        id: Date.now(),
        name: userName,
        isAdmin: false
    };

    state.currentGroup = groupName;
    group.participants.set(state.currentUser.id, state.currentUser);
    state.participants = group.participants;

    // システムメッセージを追加
    addSystemMessage(`${userName}さんがグループに参加しました`);

    initializeMeeting();
}

// チャット機能
function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message) return;

    const newMessage = {
        id: Date.now(),
        sender: state.currentUser,
        content: message,
        timestamp: new Date()
    };

    const group = state.groups.get(state.currentGroup);
    if (!group.messages) group.messages = [];
    group.messages.push(newMessage);

    input.value = '';
    updateChatMessages();
    scrollChatToBottom();
}

function addSystemMessage(content) {
    const group = state.groups.get(state.currentGroup);
    if (!group.messages) group.messages = [];
    
    group.messages.push({
        id: Date.now(),
        system: true,
        content: content,
        timestamp: new Date()
    });

    updateChatMessages();
}

function updateChatMessages() {
    const messagesDiv = document.getElementById('chatMessages');
    const group = state.groups.get(state.currentGroup);
    if (!messagesDiv || !group) return;

    messagesDiv.innerHTML = '';
    group.messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        
        if (msg.system) {
            messageDiv.className = 'message system';
            messageDiv.innerHTML = `
                <div class="system-message">
                    ${msg.content}
                </div>
            `;
        } else {
            messageDiv.className = `message ${msg.sender.id === state.currentUser.id ? 'sent' : 'received'}`;
            messageDiv.innerHTML = `
                <div class="message-content">
                    ${msg.content}
                </div>
                <div class="message-info">
                    ${msg.sender.name} - ${formatDateTime(new Date(msg.timestamp))}
                </div>
            `;
        }
        
        messagesDiv.appendChild(messageDiv);
    });
}

// メンバーリスト更新
function updateMemberList() {
    const memberList = document.getElementById('memberList');
    const memberCount = document.getElementById('memberCount');
    const groupNameElement = document.getElementById('groupName');
    
    if (!memberList || !state.currentGroup) return;

    const group = state.groups.get(state.currentGroup);
    
    // グループ名表示
    if (groupNameElement) {
        groupNameElement.textContent = state.currentGroup;
    }

    // メンバー数表示
    if (memberCount) {
        memberCount.textContent = `参加者: ${group.participants.size}人`;
    }

    // メンバーリスト表示
    memberList.innerHTML = '';
    group.participants.forEach(participant => {
        const memberDiv = document.createElement('div');
        memberDiv.className = `member-item ${participant.id === state.currentSpeaker ? 'speaking' : ''}`;
        memberDiv.innerHTML = `
            ${participant.id === state.currentSpeaker ? '🎤 ' : ''}
            ${participant.name}
            ${participant.id === state.currentUser.id ? ' (あなた)' : ''}
        `;
        memberList.appendChild(memberDiv);
    });
}

// タイマー制御
function startTimer() {
    if (state.timers.interval) return;
    
    state.timers.interval = setInterval(() => {
        if (state.currentSpeaker) {
            state.timers.total++;
            const speakerTimer = state.timers.individual.get(state.currentSpeaker) || 0;
            state.timers.individual.set(state.currentSpeaker, speakerTimer + 1);
            updateTimerDisplays();
            updateParticipantsList();
        }
    }, 1000);
}

function stopTimer() {
    if (state.timers.interval) {
        clearInterval(state.timers.interval);
        state.timers.interval = null;
    }
}

function toggleSpeaking() {
    const button = document.getElementById('speakButton');
    
    if (state.currentSpeaker === state.currentUser.id) {
        state.currentSpeaker = null;
        button.textContent = '発言開始';
        button.classList.remove('speaking');
        stopTimer();
        addSystemMessage(`${state.currentUser.name}さんが発言を終了しました`);
    } else {
        if (state.currentSpeaker) {
            addSystemMessage(`${state.participants.get(state.currentSpeaker).name}さんの発言が終了しました`);
        }
        state.currentSpeaker = state.currentUser.id;
        button.textContent = '発言終了';
        button.classList.add('speaking');
        startTimer();
        addSystemMessage(`${state.currentUser.name}さんが発言を開始しました`);
    }
    
    updateParticipantsList();
    updateMemberList();
}

// リアクション機能
function addReaction(participantId, type) {
    if (!state.reactions.has(participantId)) {
        state.reactions.set(participantId, []);
    }
    
    const reaction = {
        type: type,
        timestamp: new Date(),
        from: state.currentUser.id
    };
    
    state.reactions.get(participantId).push(reaction);
    
    // リアクションメッセージをチャットに追加
    const fromUser = state.currentUser.name;
    const toUser = state.participants.get(participantId).name;
    const reactionEmoji = {
        'thumbsUp': '👍',
        'thumbsDown': '👎',
        'question': '❓'
    }[type];
    
    addSystemMessage(`${fromUser}さんが${toUser}さんに${reactionEmoji}をリアクションしました`);
    
    updateParticipantsList();
}

// UI更新
function updateTimerDisplays() {
    document.getElementById('totalTimer').textContent = formatTime(state.timers.total);
    if (state.currentUser) {
        const personalTime = state.timers.individual.get(state.currentUser.id) || 0;
        document.getElementById('personalTimer').textContent = formatTime(personalTime);
    }
}

function updateParticipantsList() {
    const grid = document.getElementById('participantsGrid');
    if (!grid || !state.currentGroup) return;

    const group = state.groups.get(state.currentGroup);
    grid.innerHTML = '';

    group.participants.forEach((participant, id) => {
        if (id !== state.currentUser.id) {
            const card = document.createElement('div');
            card.className = `participant-card ${id === state.currentSpeaker ? 'speaking' : ''}`;
            
            const time = state.timers.individual.get(id) || 0;
            const reactions = state.reactions.get(id) || [];
            
            card.innerHTML = `
                <div class="participant-header">
                    <h3>${participant.name} ${id === state.currentSpeaker ? '🎤' : ''}</h3>
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

// チャットのスクロール制御
function scrollChatToBottom() {
    const messagesDiv = document.getElementById('chatMessages');
    if (messagesDiv) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

// ミーティング終了と統計
function endMeeting() {
    if (confirm('ミーティングを終了しますか？')) {
        stopTimer();
        addSystemMessage('ミーティングが終了しました');
        generateStats();
        switchView('stats');
    }
}

function generateStats() {
    // 発言時間ランキング
    const timeRanking = Array.from(state.participants.values())
        .map(participant => ({
            name: participant.name,
            time: state.timers.individual.get(participant.id) || 0
        }))
        .sort((a, b) => b.time - a.time);

    // リアクションランキング
    const reactionRankings = {
        thumbsUp: [],
        thumbsDown: [],
        question: []
    };

    state.participants.forEach((participant) => {
        ['thumbsUp', 'thumbsDown', 'question'].forEach(type => {
            reactionRankings[type].push({
                name: participant.name,
                count: (state.reactions.get(participant.id) || [])
                    .filter(r => r.type === type).length
            });
        });
    });

    // ランキング表示
    updateRankingDisplays(timeRanking, reactionRankings);

    // メモの表示
    document.getElementById('finalNote').textContent = 
        state.notes.get(state.currentGroup) || 'メモはありません';
}

// 初期化と定期更新
function initializeMeeting() {
    document.getElementById('mainNav').style.display = 'flex';
    switchView('meeting');
    updateTimerDisplays();
    updateParticipantsList();
    updateMemberList();
    
    const noteArea = document.getElementById('sharedNote');
    noteArea.value = state.notes.get(state.currentGroup) || '';
    noteArea.addEventListener('input', updateNote);

    startPeriodicUpdates();
}

function startPeriodicUpdates() {
    setInterval(() => {
        if (state.currentGroup) {
            updateTimerDisplays();
            updateParticipantsList();
            updateMemberList();
        }
    }, 1000);
}

// アプリケーション起動時の初期化
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('mainNav').style.display = 'none';
    switchView('title');
});

// メッセージ入力欄の自動リサイズ
document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    }
});
