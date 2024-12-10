// グローバル変数
let currentGroup = {
    name: '',
    members: []
};

let timers = {
    total: 0,
    members: {}
};

let reactions = {};
let activeTimer = null;
let timerInterval = null;

// 画面切り替え関数
function showScreen(screenId) {
    console.log('Showing screen:', screenId);
    // 全画面を非表示
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    // 指定された画面を表示
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.remove('hidden');
        
        // 画面特有の初期化
        if (screenId === 'timer-screen') {
            // 会議開始時にデータをリセット
            resetMeetingData();
            initializeTimerScreen();
        }
        if (screenId === 'chat-screen') {
            initializeChatScreen();
        }
        if (screenId === 'stats-screen') {
            showStats();
        }
        if (screenId === 'choice-screen') {
            updateChoiceScreen();
        }
    }
}

// 選択画面の更新
function updateChoiceScreen() {
    // グループ名を表示
    document.getElementById('current-group-name').textContent = currentGroup.name;
    
    // メンバーリストを表示
    const membersList = document.getElementById('current-members-list');
    membersList.innerHTML = '';
    currentGroup.members.forEach(member => {
        const memberTag = document.createElement('span');
        memberTag.className = 'member-tag';
        memberTag.textContent = member;
        membersList.appendChild(memberTag);
    });
}

// メンバー入力フィールド追加
function addMemberInput() {
    const membersList = document.getElementById('members-list');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'member-input';
    input.placeholder = 'メンバー名';
    membersList.appendChild(input);
}

// 会議データのみリセット用の関数
function resetMeetingData() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    activeTimer = null;
    
    // タイマーとリアクションのリセット
    timers.total = 0;
    currentGroup.members.forEach(member => {
        timers.members[member] = 0;
        reactions[member] = {
            like: 0,
            thinking: 0,
            question: 0
        };
    });

    // 共有メモのクリア
    const sharedMemo = document.getElementById('shared-memo');
    if (sharedMemo) {
        sharedMemo.value = '';
    }
}

// グループのリセット
function resetGroup() {
    // 完全リセット（新しいグループ作成時）
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    activeTimer = null;
    timers = {
        total: 0,
        members: {}
    };
    reactions = {};
    
    // チャットメッセージもクリア
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
    }

    // 共有メモもクリア
    const sharedMemo = document.getElementById('shared-memo');
    if (sharedMemo) {
        sharedMemo.value = '';
    }
    
    // グループ作成画面に戻る
    showScreen('group-screen');
}

// グループ作成処理
function createGroup() {
    const groupName = document.getElementById('group-name').value;
    const memberInputs = document.querySelectorAll('.member-input');
    const members = Array.from(memberInputs)
        .map(input => input.value.trim())
        .filter(name => name !== '');

    if (members.length < 2) {
        alert('2人以上のメンバーが必要です。');
        return;
    }

    currentGroup.name = groupName;
    currentGroup.members = members;
    
    // タイマーと反応を初期化
    timers.total = 0;
    timers.members = {};
    reactions = {};
    
    members.forEach(member => {
        timers.members[member] = 0;
        reactions[member] = {
            like: 0,
            thinking: 0,
            question: 0
        };
    });

    // チャットメッセージをクリア
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
    }

    showScreen('choice-screen');
}

// タイマーの開始/停止
function toggleTimer(member) {
    const btn = document.querySelector(`[onclick="toggleTimer('${member}')"]`);
    
    if (activeTimer === member) {
        // タイマー停止
        clearInterval(timerInterval);
        timerInterval = null;
        activeTimer = null;
        btn.textContent = '発言開始';
    } else {
        // 既存のタイマーがある場合は停止
        if (timerInterval) {
            clearInterval(timerInterval);
            const prevBtn = document.querySelector(`[onclick="toggleTimer('${activeTimer}')"]`);
            if (prevBtn) prevBtn.textContent = '発言開始';
        }
        
        // 新しいタイマー開始
        activeTimer = member;
        btn.textContent = '発言終了';
        timerInterval = setInterval(() => {
            timers.total++;
            timers.members[member]++;
            updateTimerDisplays();
        }, 1000);
    }
}

// リアクション追加
function addReaction(member, type) {
    if (!reactions[member]) {
        reactions[member] = { like: 0, thinking: 0, question: 0 };
    }
    reactions[member][type]++;
    const btn = document.querySelector(
        `[onclick="addReaction('${member}', '${type}')"]`
    );
    const emoji = type === 'like' ? '👍' : type === 'thinking' ? '🤔' : '❓';
    btn.textContent = `${emoji} ${reactions[member][type]}`;
}

// 会議終了
function endMeeting() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    activeTimer = null;
    showStats();
    showScreen('stats-screen');
}

// メッセージ送信
function sendMessage() {
    const input = document.getElementById('message-input');
    const select = document.getElementById('chat-member-select');
    const messagesContainer = document.getElementById('chat-messages');
    
    if (!select.value) {
        alert('発言者を選択してください');
        return;
    }
    
    if (input.value.trim()) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        const senderSpan = document.createElement('span');
        senderSpan.className = 'sender';
        senderSpan.textContent = select.value;
        messageDiv.appendChild(senderSpan);
        messageDiv.appendChild(document.createTextNode(input.value));
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        input.value = '';
    }
}

// タイマー画面の初期化
function initializeTimerScreen() {
    const memberTimers = document.getElementById('member-timers');
    memberTimers.innerHTML = '';

    currentGroup.members.forEach(member => {
        const memberTimer = document.createElement('div');
        memberTimer.className = 'member-timer';
        memberTimer.innerHTML = `
            <h3>${member}</h3>
            <div class="timer-display">${formatTime(timers.members[member])}</div>
            <button class="talk-btn" onclick="toggleTimer('${member}')">発言開始</button>
            <div class="reaction-buttons">
                <button onclick="addReaction('${member}', 'like')">👍 ${reactions[member].like}</button>
                <button onclick="addReaction('${member}', 'thinking')">🤔 ${reactions[member].thinking}</button>
                <button onclick="addReaction('${member}', 'question')">❓ ${reactions[member].question}</button>
            </div>
        `;
        memberTimers.appendChild(memberTimer);
    });

    document.getElementById('total-timer').textContent = formatTime(timers.total);
}

// チャット画面の初期化
function initializeChatScreen() {
    const select = document.getElementById('chat-member-select');
    select.innerHTML = '<option value="">発言者を選択</option>';
    currentGroup.members.forEach(member => {
        const option = document.createElement('option');
        option.value = member;
        option.textContent = member;
        select.appendChild(option);
    });
}

// タイマー表示の更新
function updateTimerDisplays() {
    document.getElementById('total-timer').textContent = formatTime(timers.total);
    Object.entries(timers.members).forEach(([member, time]) => {
        const memberTimerDisplay = document.querySelector(
            `[onclick="toggleTimer('${member}')"]`
        ).parentElement.querySelector('.timer-display');
        if (memberTimerDisplay) {
            memberTimerDisplay.textContent = formatTime(time);
        }
    });
}

// 時間のフォーマット
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

// 統計の表示
function showStats() {
    // 発言時間ランキング
    const timeRanking = document.getElementById('time-ranking-list');
    const sortedByTime = Object.entries(timers.members)
        .sort(([, a], [, b]) => b - a);

    timeRanking.innerHTML = sortedByTime
        .map(([member, time], index) => `
            <div class="ranking-item">
                ${index + 1}位: ${member} (${formatTime(time)})
            </div>
        `).join('');

    // 各リアクションタイプごとのランキング
    const reactionTypes = ['like', 'thinking', 'question'];
    const emojis = {'like': '👍', 'thinking': '🤔', 'question': '❓'};
    
    reactionTypes.forEach(type => {
        const sortedReactions = Object.entries(reactions)
            .sort(([, a], [, b]) => b[type] - a[type]);
            
        document.getElementById(`${type}-ranking-list`).innerHTML = 
            sortedReactions
                .filter(([, counts]) => counts[type] > 0)
                .map(([member, counts], index) => `
                    <div class="ranking-item">
                        ${index + 1}位: ${member} (${emojis[type]} ${counts[type]}回)
                    </div>
                `).join('') || '<div class="ranking-item">データなし</div>';
    });

    // 共有メモの表示
    const memoContent = document.getElementById('memo-content');
    const memoText = document.getElementById('shared-memo').value;
    memoContent.textContent = memoText || '共有メモは空です';
}

// エンターキーでメッセージ送信
document.addEventListener('DOMContentLoaded', function() {
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
});
