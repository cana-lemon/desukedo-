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

// stateオブジェクトの初期化
const state = {
    groups: new Map(),  // グループ情報
    currentUser: null,  // 現在のユーザー
    currentGroup: null, // 現在のグループ
    participants: null  // 参加者
};

// グループ作成関数
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

    // 新しいグループを作成
    const newGroup = {
        password: password,
        participants: new Map(),
        createdAt: new Date()
    };

    // ユーザー情報を設定（管理者として）
    state.currentUser = {
        id: Date.now(),  // ユーザーID（現時点では一意に生成）
        name: userName,
        isAdmin: true,
        groupName: groupName
    };

    // グループを保存
    state.groups.set(groupName, newGroup);
    state.currentGroup = groupName;
    newGroup.participants.set(state.currentUser.id, state.currentUser);
    state.participants = newGroup.participants;

    initializeMeeting();
}

// グループ参加関数
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

    // 参加者情報を設定
    state.currentUser = {
        id: Date.now(),  // ユーザーID（現時点では一意に生成）
        name: userName,
        isAdmin: false,
        groupName: groupName
    };

    // 参加者リストに追加
    state.currentGroup = groupName;
    group.participants.set(state.currentUser.id, state.currentUser);
    state.participants = group.participants;

    initializeMeeting();
}

// タイマー制御
function toggleSpeaking() {
    const button = document.getElementById('speakButton');
    
    if (state.currentSpeaker === state.currentUser.id) {
        // 発言終了
        state.currentSpeaker = null;
        button.textContent = '発言開始';
        button.classList.remove('speaking');
        stopTimer();
    } else {
        // 発言開始
        state.currentSpeaker = state.currentUser.id;
        button.textContent = '発言終了';
        button.classList.add('speaking');
        startTimer();
    }
    
    updateParticipantsList();
}

function startTimer() {
    if (state.timers.interval) return;
    
    state.timers.interval = setInterval(() => {
        if (state.currentSpeaker) {
            state.timers.total++;
            const speakerTimer = state.timers.individual.get(state.currentSpeaker) || 0;
            state.timers.individual.set(state.currentSpeaker, speakerTimer + 1);
            updateTimerDisplays();
        }
    }, 1000);
}

function stopTimer() {
    if (state.timers.interval) {
        clearInterval(state.timers.interval);
        state.timers.interval = null;
    }
}

// リアクション機能
function addReaction(participantId, type) {
    if (!state.reactions.has(participantId)) {
        state.reactions.set(participantId, []);
    }
    
    state.reactions.get(participantId).push({
        type: type,
        timestamp: new Date(),
        from: state.currentUser.id
    });
    
    updateParticipantsList();
}

// UI更新機能
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

    const group = state.groups.get(state.currentGroup);
    if (!group) return;

    group.participants.forEach((participant, id) => {
        if (id !== state.currentUser.id) {
            const card = document.createElement('div');
            card.className = `participant-card ${id === state.currentSpeaker ? 'speaking' : ''}`;
            
            const time = state.timers.individual.get(id) || 0;
            const reactions = state.reactions.get(id) || [];
            
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

// ミーティング終了と統計
function endMeeting() {
    if (confirm('ミーティングを終了しますか？')) {
        stopTimer();
        generateStats();
        switchView('stats');
    }
}

function generateStats() {
    // 発言時間ランキング
    const timeRanking = Array.from(state.timers.individual.entries())
        .map(([id, time]) => ({
            name: state.participants.get(id).name,
            time: time
        }))
        .sort((a, b) => b.time - a.time);

    // リアクションランキング
    const reactionRankings = {
        thumbsUp: [],
        thumbsDown: [],
        question: []
    };

    state.participants.forEach((participant, id) => {
        const reactions = state.reactions.get(id) || [];
        reactionRankings.thumbsUp.push({
            name: participant.name,
            count: reactions.filter(r => r.type === 'thumbsUp').length
        });
        reactionRankings.thumbsDown.push({
            name: participant.name,
            count: reactions.filter(r => r.type === 'thumbsDown').length
        });
        reactionRankings.question.push({
            name: participant.name,
            count: reactions.filter(r => r.type === 'question').length
        });
    });

    // ランキングの表示
    document.getElementById('timeRanking').innerHTML = timeRanking
        .map((item, index) => `
            <div class="ranking-item">
                <span>${index + 1}. ${item.name}</span>
                <span>${formatTime(item.time)}</span>
            </div>
        `).join('');

    ['thumbsUp', 'thumbsDown', 'question'].forEach(type => {
        const ranking = reactionRankings[type]
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);
        
        document.getElementById(`${type}Ranking`).innerHTML = ranking
            .map((item, index) => `
                <div class="ranking-item">
                    <span>${index + 1}. ${item.name}</span>
                    <span>${item.count}回</span>
                </div>
            `).join('');
    });

    // メモの表示
    document.getElementById('finalNote').textContent = 
        state.notes.get(state.currentGroup) || 'メモはありません';
}

// メモ機能
function updateNote(event) {
    const noteContent = event.target.value;
    state.notes.set(state.currentGroup, noteContent);
}

// 統計の保存
function saveStats() {
    const stats = {
        groupName: state.currentGroup,
        date: new Date().toISOString(),
        totalTime: state.timers.total,
        participants: Array.from(state.participants.values()),
        individualTimes: Object.fromEntries(state.timers.individual),
        reactions: Object.fromEntries(state.reactions),
        note: state.notes.get(state.currentGroup)
    };

    const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-stats-${state.currentGroup}-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
}

function startNewMeeting() {
    if (confirm('新しいミーティングを開始しますか？')) {
        location.reload();
    }
}

// 初期化
function initializeMeeting() {
    switchView('meeting');
    updateTimerDisplays();
    updateParticipantsList();
    
    const noteArea = document.getElementById('sharedNote');
    noteArea.value = state.notes.get(state.currentGroup) || '';
    noteArea.addEventListener('input', updateNote);
}

document.addEventListener('DOMContentLoaded', () => {
    switchView('login');
});
