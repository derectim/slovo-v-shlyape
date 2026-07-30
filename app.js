/**
 * «Слово в шляпе» — Полный кроссплатформенный мультиплеер (Telegram + VK + Web + Mobile).
 * Кросс-доменный сетевой движок ntfy.sh (?cache=yes) без CORS-блокировок.
 */

// Инициализация VK Bridge для ВК Mini Apps
if (window.vkBridge) {
  try {
    window.vkBridge.send('VKWebAppInit', {});
  } catch (e) {
    console.log('VK Bridge init skipped');
  }
}

// Игровые Константы Раундов
const ROUNDS = [
  {
    title: 'Объяснение словами',
    shortTitle: 'Словами',
    description: 'Объясняйте значение карточки любыми словами, но не называйте само слово и однокоренные слова.'
  },
  {
    title: 'Пантомима',
    shortTitle: 'Жестами',
    description: 'Показывайте слово движениями и мимикой. Разговаривать и издавать звуки строго запрещено!'
  },
  {
    title: 'Одно слово',
    shortTitle: 'Одним словом',
    description: 'Те же слова! Разрешена только одна короткая словесная подсказка. После неё добавлять слова нельзя.'
  }
];

// Состояние Игровой Сессии
let gameState = {
  playMode: 'local', // 'local' или 'online'
  currentMode: 'random', // 'random' или 'manual'
  onlineRoomCode: null,
  isHost: false,
  myPlayerId: 'p_' + Math.random().toString(36).substr(2, 7) + '_' + Math.floor(Math.random()*1000),
  myPlayerName: '',
  rawPlayerNames: ['Игрок 1', 'Игрок 2', 'Игрок 3', 'Игрок 4'],
  onlinePlayers: [],
  teams: [
    { name: 'Команда 1', playerNames: ['Игрок 1', 'Игрок 2'], roundScores: [0, 0, 0], explainerCursor: 0 },
    { name: 'Команда 2', playerNames: ['Игрок 3', 'Игрок 4'], roundScores: [0, 0, 0], explainerCursor: 0 }
  ],
  wordsPerPlayer: 5,
  turnSeconds: 60,
  allCards: [],
  deck: [],
  currentCard: null,
  currentRoundIndex: 0,
  activeTeamIndex: 0,
  wordEntryPlayerIndex: 0,
  turnGuessedCount: 0,
  timerInterval: null,
  secondsLeft: 0
};

// Сетевые переменные (ntfy.sh HTTP + WebSocket Relay)
let wsClient = null;
let roomSyncInterval = null;
let processedMsgIds = new Set();

// Список всех игроков одной плоскостью
function getAllPlayers() {
  const players = [];
  gameState.teams.forEach((team, teamIndex) => {
    team.playerNames.forEach((playerName, playerIndex) => {
      players.push({
        name: playerName,
        teamName: team.name,
        teamIndex,
        playerIndex
      });
    });
  });
  return players;
}

// Переключение Экранов
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');
}

// --------------------------------------------------------------------------
// 0. КРОСС-ПЛАТФОРМЕННЫЙ ОНЛАЙН С ГАРАНТИРОВАННЫМ WSS/HTTP RELAY (NTFY.SH)
// --------------------------------------------------------------------------

function getMyName() {
  const input = document.getElementById('input-online-player-name');
  if (input && input.value.trim()) {
    gameState.myPlayerName = input.value.trim();
  }
  if (!gameState.myPlayerName) {
    gameState.myPlayerName = `Игрок ${Math.floor(10 + Math.random() * 90)}`;
  }
  return gameState.myPlayerName;
}

function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function createOnlineRoom() {
  gameState.playMode = 'online';
  gameState.isHost = true;
  gameState.onlineRoomCode = generateRoomCode();
  const myName = getMyName();

  gameState.onlinePlayers = [{ id: gameState.myPlayerId, name: myName, isHost: true, lastActive: Date.now() }];

  connectNtfyRoom(gameState.onlineRoomCode);
  renderOnlineLobby();
  showScreen('screen-online-lobby');
}

function joinOnlineRoom(code) {
  if (!code || code.length !== 4) {
    alert('Пожалуйста, введите 4-значный код комнаты!');
    return;
  }
  gameState.playMode = 'online';
  gameState.isHost = false;
  gameState.onlineRoomCode = code.toUpperCase();
  const myName = getMyName();

  gameState.onlinePlayers = [{ id: gameState.myPlayerId, name: myName, isHost: false, lastActive: Date.now() }];

  connectNtfyRoom(gameState.onlineRoomCode);
  renderOnlineLobby();
  showScreen('screen-online-lobby');
}

function connectNtfyRoom(code) {
  if (wsClient) {
    try { wsClient.close(); } catch (e) {}
  }
  clearInterval(roomSyncInterval);
  processedMsgIds.clear();

  const topic = `slovo_room_${code}`;

  // 1. WebSocket для моментальной связи
  try {
    wsClient = new WebSocket(`wss://ntfy.sh/${topic}/ws`);
    wsClient.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);
        if (raw.id && !processedMsgIds.has(raw.id)) {
          processedMsgIds.add(raw.id);
          if (raw.event === 'message' && raw.message) {
            parseRoomPayload(raw.message);
          }
        }
      } catch (e) {}
    };
  } catch (e) {}

  // 2. HTTP Polling синхронизатор каждые 1.0 секунду для подстраховки
  roomSyncInterval = setInterval(() => {
    postRoomPayload({
      type: 'heartbeat',
      id: gameState.myPlayerId,
      name: getMyName(),
      isHost: gameState.isHost
    });

    fetchHistoryPayloads(topic);

    if (gameState.isHost) {
      const now = Date.now();
      const activePlayers = gameState.onlinePlayers.filter(p => p.id === gameState.myPlayerId || (now - (p.lastActive || now)) < 10000);
      if (activePlayers.length !== gameState.onlinePlayers.length) {
        gameState.onlinePlayers = activePlayers;
        renderOnlineLobby();
      }
      broadcastPlayersList();
    }
  }, 1000);

  // Сразу анонсируем вход
  postRoomPayload({
    type: 'join',
    id: gameState.myPlayerId,
    name: getMyName(),
    isHost: gameState.isHost
  });
}

// Отправка с тегом ?cache=yes без дополнительных CORS заголовков (работает на 100% браузеров!)
function postRoomPayload(payloadObj) {
  if (!gameState.onlineRoomCode) return;
  const topic = `slovo_room_${gameState.onlineRoomCode}`;
  try {
    fetch(`https://ntfy.sh/${topic}?cache=yes`, {
      method: 'POST',
      body: JSON.stringify(payloadObj)
    }).catch(() => {});
  } catch (e) {}
}

function fetchHistoryPayloads(topic) {
  try {
    fetch(`https://ntfy.sh/${topic}/json?poll=1&since=5m`)
      .then(res => res.text())
      .then(text => {
        const lines = text.trim().split('\n');
        lines.forEach(line => {
          if (!line) return;
          try {
            const raw = JSON.parse(line);
            if (raw.id && !processedMsgIds.has(raw.id)) {
              processedMsgIds.add(raw.id);
              if (raw.event === 'message' && raw.message) {
                parseRoomPayload(raw.message);
              }
            }
          } catch (e) {}
        });
      })
      .catch(() => {});
  } catch (e) {}
}

function parseRoomPayload(msgStr) {
  try {
    const msg = JSON.parse(msgStr);

    if (msg.type === 'join' || msg.type === 'heartbeat') {
      handleIncomingPlayer(msg);
    } else if (msg.type === 'sync_players') {
      if (!gameState.isHost && msg.players && msg.players.length > 0) {
        gameState.onlinePlayers = msg.players;
        renderOnlineLobby();
      }
    } else if (msg.type === 'start_game') {
      gameState.teams = msg.teams;
      gameState.wordsPerPlayer = msg.wordsPerPlayer || 5;
      gameState.turnSeconds = msg.turnSeconds || 60;
      startWordEntry();
    }
  } catch (e) {}
}

function broadcastPlayersList() {
  postRoomPayload({
    type: 'sync_players',
    players: gameState.onlinePlayers.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
  });
}

function handleIncomingPlayer(msg) {
  const now = Date.now();
  const existing = gameState.onlinePlayers.find(p => p.id === msg.id);

  if (!existing) {
    gameState.onlinePlayers.push({ id: msg.id, name: msg.name, isHost: msg.isHost, lastActive: now });
  } else {
    existing.name = msg.name;
    existing.lastActive = now;
    if (msg.isHost) existing.isHost = true;
  }

  renderOnlineLobby();

  if (gameState.isHost) {
    broadcastPlayersList();
  }
}

function renderOnlineLobby() {
  document.getElementById('lobby-code-display').textContent = gameState.onlineRoomCode;
  document.getElementById('lobby-code-badge').textContent = `КОД: ${gameState.onlineRoomCode}`;
  document.getElementById('lobby-players-count').textContent = gameState.onlinePlayers.length;

  const container = document.getElementById('lobby-players-list');
  if (container) {
    container.innerHTML = gameState.onlinePlayers.map(p => `
      <div class="player-row" style="background: rgba(255,255,255,0.06); padding: 12px 16px; border-radius: 14px; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 20px;">👤</span>
          <span style="font-weight: 800; font-size: 16px;">${escapeHtml(p.name)} ${p.id === gameState.myPlayerId ? ' <span style="color: var(--secondary); font-size: 13px;">(Вы)</span>' : ''}</span>
        </div>
        ${p.isHost ? '<span class="team-badge">👑 Хост</span>' : '<span class="setting-hint" style="color: var(--success); font-weight: 700;">🟢 В сети</span>'}
      </div>
    `).join('');
  }

  const startBtn = document.getElementById('btn-host-start-setup');
  if (startBtn) {
    if (gameState.isHost) {
      startBtn.style.display = 'flex';
      startBtn.textContent = `🎲 Перемешать ${gameState.onlinePlayers.length} игроков по парам и начать ➔`;
    } else {
      startBtn.style.display = 'none';
    }
  }
}

function shareRoomLink() {
  const code = gameState.onlineRoomCode || '7392';
  const roomUrl = `https://derectim.github.io/slovo-v-shlyape/#room=${code}`;
  const shareText = `🎩 Сыграем в «Слово в шляпе»! Заходи в комнату по коду: ${code}\n${roomUrl}`;

  fallbackCopy(shareText, code, roomUrl);
}

function fallbackCopy(textToCopy, code, roomUrl) {
  let success = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(textToCopy);
      success = true;
    }
  } catch (e) {}

  if (!success) {
    const tempInput = document.createElement('textarea');
    tempInput.value = textToCopy;
    tempInput.style.position = 'fixed';
    tempInput.style.left = '-9999px';
    document.body.appendChild(tempInput);
    tempInput.focus();
    tempInput.select();
    try {
      document.execCommand('copy');
      success = true;
    } catch (err) {}
    document.body.removeChild(tempInput);
  }

  if (navigator.share && /mobile|android|iphone|ipad/i.test(navigator.userAgent)) {
    navigator.share({
      title: 'Слово в шляпе — Онлайн игра',
      text: `Сыграем в «Слово в шляпе»! Заходи в комнату по коду: ${code}`,
      url: roomUrl
    }).catch(() => {});
  } else if (window.vkBridge && typeof window.vkBridge.send === 'function') {
    try {
      window.vkBridge.send('VKWebAppShare', { link: roomUrl }).catch(() => {});
    } catch (e) {}
  }

  alert(`📋 Ссылка на комнату ${code} скопирована в буфер обмена!\n\nОтправьте её друзьям в чат Telegram или VK!`);
}

function checkUrlRoomCode() {
  let raw = window.location.hash + ' ' + window.location.search;
  const match = raw.match(/([0-9]{4})/);
  if (match && /room|startapp|code/i.test(raw)) {
    joinOnlineRoom(match[1]);
  }
}

// --------------------------------------------------------------------------
// 1. НАСТРОЙКА ИГРЫ (РЕЖИМ 1: СЛУЧАЙНЫЕ ПАРЫ | РЕЖИМ 2: РУЧНЫЕ КОМАНДЫ)
// --------------------------------------------------------------------------

function switchSetupMode(mode) {
  gameState.currentMode = mode;

  const tabRandom = document.getElementById('tab-mode-random');
  const tabManual = document.getElementById('tab-mode-manual');
  const viewRandom = document.getElementById('view-mode-random');
  const viewManual = document.getElementById('view-mode-manual');

  if (mode === 'random') {
    tabRandom.classList.add('active');
    tabManual.classList.remove('active');
    viewRandom.classList.remove('hidden');
    viewManual.classList.add('hidden');
    renderRandomPlayers();
  } else {
    tabManual.classList.add('active');
    tabRandom.classList.remove('active');
    viewManual.classList.remove('hidden');
    viewRandom.classList.add('hidden');
    renderManualTeams();
  }
}

function renderRandomPlayers() {
  const container = document.getElementById('random-players-list');
  if (!container) return;
  container.innerHTML = '';

  gameState.rawPlayerNames.forEach((name, idx) => {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `
      <input type="text" class="input-field" value="${escapeHtml(name)}" onchange="updateRawPlayerName(${idx}, this.value)">
      ${gameState.rawPlayerNames.length > 4 ? `<button class="btn-icon-only" onclick="removeRawPlayer(${idx})">✕</button>` : ''}
    `;
    container.appendChild(row);
  });
}

function updateRawPlayerName(idx, val) {
  if (val.trim()) gameState.rawPlayerNames[idx] = val.trim();
}

function addRawPlayer() {
  const count = gameState.rawPlayerNames.length + 1;
  gameState.rawPlayerNames.push(`Игрок ${count}`);
  renderRandomPlayers();
}

function removeRawPlayer(idx) {
  if (gameState.rawPlayerNames.length > 4) {
    gameState.rawPlayerNames.splice(idx, 1);
    renderRandomPlayers();
  }
}

// Автоматическое распределение подключенных игроков по парам и старт игры
function shuffleRawPairs() {
  let valid = [];
  if (gameState.playMode === 'online') {
    valid = gameState.onlinePlayers.map(p => p.name.trim()).filter(n => n.length > 0);
  } else {
    valid = gameState.rawPlayerNames.map(n => n.trim()).filter(n => n.length > 0);
  }

  if (valid.length < 4) {
    alert('Минимум 4 участника для игры командами!');
    return;
  }

  if (valid.length % 2 !== 0) {
    valid.push(`Игрок ${valid.length + 1}`);
  }

  for (let i = valid.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [valid[i], valid[j]] = [valid[j], valid[i]];
  }

  gameState.teams = [];
  for (let i = 0; i < valid.length; i += 2) {
    const teamNum = (i / 2) + 1;
    gameState.teams.push({
      name: `Команда ${teamNum}`,
      playerNames: [valid[i], valid[i + 1]],
      roundScores: [0, 0, 0],
      explainerCursor: 0
    });
  }

  if (gameState.playMode === 'online' && gameState.isHost) {
    postRoomPayload({
      type: 'start_game',
      teams: gameState.teams,
      wordsPerPlayer: gameState.wordsPerPlayer,
      turnSeconds: gameState.turnSeconds
    });

    startWordEntry();
  } else if (gameState.playMode === 'local') {
    alert(`🎉 Участники успешно распределены на ${gameState.teams.length} пары!`);
  }
}

// РЕЖИМ 2: РЕНДЕР РУЧНЫХ КОМАНД (ПО 2 ИГРОКА)
function renderManualTeams() {
  const container = document.getElementById('teams-container');
  if (!container) return;
  container.innerHTML = '';

  gameState.teams.forEach((team, tIdx) => {
    const card = document.createElement('div');
    card.className = 'team-card';

    let playersHtml = team.playerNames.map((pName, pIdx) => `
      <div class="player-row">
        <input type="text" class="input-field" value="${escapeHtml(pName)}" onchange="updatePlayerName(${tIdx}, ${pIdx}, this.value)">
      </div>
    `).join('');

    card.innerHTML = `
      <div class="team-header">
        <input type="text" class="input-field input-team-name" value="${escapeHtml(team.name)}" onchange="updateTeamName(${tIdx}, this.value)">
        ${gameState.teams.length > 2 ? `<button class="btn-icon-only" onclick="removeTeam(${tIdx})">🗑</button>` : ''}
      </div>
      <div class="players-list">
        ${playersHtml}
      </div>
    `;
    container.appendChild(card);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function updateTeamName(tIdx, name) {
  if (name.trim()) gameState.teams[tIdx].name = name.trim();
}

function updatePlayerName(tIdx, pIdx, name) {
  if (name.trim()) gameState.teams[tIdx].playerNames[pIdx] = name.trim();
}

function addTeam() {
  if (gameState.teams.length < 6) {
    const num = gameState.teams.length + 1;
    gameState.teams.push({
      name: `Команда ${num}`,
      playerNames: [`Игрок ${num * 2 - 1}`, `Игрок ${num * 2}`],
      roundScores: [0, 0, 0],
      explainerCursor: 0
    });
    renderManualTeams();
  }
}

function removeTeam(tIdx) {
  if (gameState.teams.length > 2) {
    gameState.teams.splice(tIdx, 1);
    renderManualTeams();
  }
}

// --------------------------------------------------------------------------
// 2. ВВОД СЛОВ (WORD ENTRY)
// --------------------------------------------------------------------------

function startWordEntry() {
  if (gameState.playMode === 'local' && gameState.currentMode === 'random' && gameState.teams.length === 0) {
    shuffleRawPairs();
  }

  gameState.wordEntryPlayerIndex = 0;
  gameState.allCards = [];
  renderWordEntryPlayer();
  showScreen('screen-word-entry');
}

function renderWordEntryPlayer() {
  const allPlayers = getAllPlayers();
  const player = allPlayers[gameState.wordEntryPlayerIndex];
  
  const progressPercent = ((gameState.wordEntryPlayerIndex + 1) / (allPlayers.length || 1)) * 100;
  document.getElementById('word-entry-progress').style.width = `${progressPercent}%`;

  document.getElementById('privacy-player-name').textContent = player ? player.name : 'Игрок';
  document.getElementById('privacy-shield').classList.remove('hidden');
  document.getElementById('words-form-container').classList.add('hidden');

  if (player) {
    document.getElementById('entry-current-player-name').textContent = player.name;
    document.getElementById('entry-current-team-name').textContent = player.teamName;
  }

  const inputsContainer = document.getElementById('word-inputs-list');
  inputsContainer.innerHTML = '';

  for (let i = 0; i < gameState.wordsPerPlayer; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-field word-entry-input';
    input.placeholder = `Слово ${i + 1}`;
    input.id = `word-input-${i}`;
    inputsContainer.appendChild(input);
  }

  const isLast = gameState.wordEntryPlayerIndex === allPlayers.length - 1;
  document.getElementById('submit-words-label').textContent = isLast ? 'Перемешать слова в шляпе' : 'Передать устройство';
}

function revealWordEntryForm() {
  document.getElementById('privacy-shield').classList.add('hidden');
  document.getElementById('words-form-container').classList.remove('hidden');
  const firstInput = document.getElementById('word-input-0');
  if (firstInput) firstInput.focus();
}

function submitCurrentPlayerWords() {
  const inputs = document.querySelectorAll('.word-entry-input');
  const words = [];
  
  for (let input of inputs) {
    const val = input.value.trim();
    if (!val) {
      alert('Пожалуйста, заполните все слова!');
      input.focus();
      return;
    }
    words.push(val);
  }

  words.forEach(word => {
    gameState.allCards.push({ id: Math.random().toString(36).substr(2, 9), word });
  });

  const allPlayers = getAllPlayers();
  if (gameState.wordEntryPlayerIndex < allPlayers.length - 1) {
    gameState.wordEntryPlayerIndex += 1;
    renderWordEntryPlayer();
  } else {
    startRound(0);
  }
}

// --------------------------------------------------------------------------
// 3. УПРАВЛЕНИЕ РАУНДАМИ И СКОВОЗНАЯ ОЧЕРЕДЬ КОМАНД
// --------------------------------------------------------------------------

function startRound(roundIndex) {
  gameState.currentRoundIndex = roundIndex;
  
  if (roundIndex === 0) {
    gameState.activeTeamIndex = 0;
  }

  gameState.deck = [...gameState.allCards].sort(() => Math.random() - 0.5);

  renderRoundIntro();
  showScreen('screen-round-intro');
}

function renderRoundIntro() {
  const round = ROUNDS[gameState.currentRoundIndex];
  const activeTeam = gameState.teams[gameState.activeTeamIndex];
  
  const explainerIdx = activeTeam.explainerCursor % activeTeam.playerNames.length;
  const guesserIdx = (activeTeam.explainerCursor + 1) % activeTeam.playerNames.length;

  const explainerName = activeTeam.playerNames[explainerIdx];
  const guesserName = activeTeam.playerNames[guesserIdx];

  document.getElementById('round-badge').textContent = `РАУНД ${gameState.currentRoundIndex + 1} ИЗ 3`;
  document.getElementById('round-title').textContent = round.title;
  document.getElementById('round-description').textContent = round.description;

  document.getElementById('intro-total-words-badge').textContent = `🎩 В шляпе: ${gameState.allCards.length} слов`;

  document.getElementById('intro-team-name').textContent = activeTeam.name;
  document.getElementById('intro-explainer-name').textContent = `🗣 Объясняет: ${explainerName}`;
  document.getElementById('intro-guesser-name').textContent = `👂 Угадывает: ${guesserName}`;

  const scoreList = document.getElementById('intro-scoreboard-list');
  scoreList.innerHTML = gameState.teams.map(t => {
    const total = t.roundScores.reduce((a, b) => a + b, 0);
    return `
      <div class="mini-score-item">
        <span>${escapeHtml(t.name)}</span>
        <span>${total} очков</span>
      </div>
    `;
  }).join('');
}

// --------------------------------------------------------------------------
// 4. ИГРОВОЙ ХОД И ИНТЕРАКТИВНЫЕ СВАЙПЫ
// --------------------------------------------------------------------------

function startTurn() {
  gameState.turnGuessedCount = 0;
  gameState.secondsLeft = gameState.turnSeconds;
  drawNextCard();

  const activeTeam = gameState.teams[gameState.activeTeamIndex];
  const explainerIdx = activeTeam.explainerCursor % activeTeam.playerNames.length;
  const guesserIdx = (activeTeam.explainerCursor + 1) % activeTeam.playerNames.length;

  const explainerName = activeTeam.playerNames[explainerIdx];
  const guesserName = activeTeam.playerNames[guesserIdx];

  document.getElementById('turn-active-team').textContent = activeTeam.name;
  document.getElementById('turn-roles-summary').textContent = `🗣 ${explainerName} ➔ 👂 ${guesserName}`;
  updateTurnUI();

  showScreen('screen-turn');
  startTimer();
}

function drawNextCard() {
  if (gameState.deck.length === 0) {
    gameState.currentCard = null;
    return;
  }
  gameState.currentCard = gameState.deck.pop();
}

function updateTurnUI() {
  const cardVal = gameState.currentCard ? gameState.currentCard.word : 'Все слова угаданы!';
  document.getElementById('card-word-value').textContent = cardVal;
  
  const currentLeft = gameState.deck.length + (gameState.currentCard ? 1 : 0);
  document.getElementById('turn-cards-left').textContent = `В шляпе: ${currentLeft} из ${gameState.allCards.length}`;
  document.getElementById('turn-guessed-count').textContent = gameState.turnGuessedCount;

  resetCardTransform();
}

function handleCardGuess() {
  if (!gameState.currentCard) return;

  gameState.teams[gameState.activeTeamIndex].roundScores[gameState.currentRoundIndex] += 1;
  gameState.turnGuessedCount += 1;

  gameState.currentCard = null;

  if (gameState.deck.length === 0) {
    finishTurn(true);
  } else {
    drawNextCard();
    updateTurnUI();
  }
}

function handleCardSkip() {
  if (!gameState.currentCard) return;

  const skippedCard = gameState.currentCard;
  gameState.currentCard = null;

  if (gameState.deck.length === 0) {
    gameState.deck.push(skippedCard);
  } else {
    const randomIdx = Math.floor(Math.random() * (gameState.deck.length + 1));
    gameState.deck.splice(randomIdx, 0, skippedCard);
  }

  drawNextCard();
  updateTurnUI();
}

function finishTurn(roundCompleted = false) {
  clearInterval(gameState.timerInterval);

  if (gameState.currentCard) {
    gameState.deck.push(gameState.currentCard);
    gameState.currentCard = null;
    gameState.deck.sort(() => Math.random() - 0.5);
  }

  const activeTeam = gameState.teams[gameState.activeTeamIndex];
  activeTeam.explainerCursor += 1;

  gameState.activeTeamIndex = (gameState.activeTeamIndex + 1) % gameState.teams.length;

  if (roundCompleted) {
    showRoundResults();
  } else {
    renderRoundIntro();
    showScreen('screen-round-intro');
  }
}

function startTimer() {
  clearInterval(gameState.timerInterval);
  const timerWidget = document.querySelector('.timer-widget');
  const timerCircle = document.getElementById('timer-progress-circle');
  const timerText = document.getElementById('timer-text');
  const totalCircleLen = 276.46;

  if (timerWidget) timerWidget.classList.remove('warning', 'danger');

  gameState.timerInterval = setInterval(() => {
    gameState.secondsLeft -= 1;
    if (timerText) timerText.textContent = gameState.secondsLeft;

    const progressRatio = gameState.secondsLeft / gameState.turnSeconds;
    const dashOffset = totalCircleLen * (1 - progressRatio);
    if (timerCircle) timerCircle.style.strokeDashoffset = dashOffset;

    if (timerWidget) {
      if (gameState.secondsLeft <= 15 && gameState.secondsLeft > 10) {
        timerWidget.classList.add('warning');
      } else if (gameState.secondsLeft <= 10) {
        timerWidget.classList.remove('warning');
        timerWidget.classList.add('danger');
      }
    }

    if (gameState.secondsLeft <= 0) {
      clearInterval(gameState.timerInterval);
      finishTurn(false);
    }
  }, 1000);
}

// --------------------------------------------------------------------------
// 5. ЖЕСТЫ И СВАЙПЫ КАРТОЧКИ
// --------------------------------------------------------------------------

let cardElem, startX = 0, startY = 0, currentX = 0, currentY = 0, isDragging = false;

function initSwipeCard() {
  cardElem = document.getElementById('swipe-card');
  if (!cardElem) return;

  cardElem.addEventListener('touchstart', handleDragStart, { passive: true });
  cardElem.addEventListener('touchmove', handleDragMove, { passive: false });
  cardElem.addEventListener('touchend', handleDragEnd);

  cardElem.addEventListener('mousedown', handleDragStart);
  window.addEventListener('mousemove', handleDragMove);
  window.addEventListener('mouseup', handleDragEnd);
}

function handleDragStart(e) {
  if (!gameState.currentCard) return;
  isDragging = true;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  startX = clientX;
  startY = clientY;
  cardElem.style.transition = 'none';
}

function handleDragMove(e) {
  if (!isDragging) return;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  
  currentX = clientX - startX;
  currentY = clientY - startY;
  
  const rotateDeg = currentX * 0.08;
  cardElem.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) rotate(${rotateDeg}deg)`;

  const guessBadge = document.getElementById('card-badge-guess');
  const skipBadge = document.getElementById('card-badge-skip');

  if (currentX > 30) {
    if (guessBadge) guessBadge.style.opacity = Math.min(currentX / 100, 1);
    if (skipBadge) skipBadge.style.opacity = 0;
  } else if (currentX < -30) {
    if (skipBadge) skipBadge.style.opacity = Math.min(Math.abs(currentX) / 100, 1);
    if (guessBadge) guessBadge.style.opacity = 0;
  } else {
    if (guessBadge) guessBadge.style.opacity = 0;
    if (skipBadge) skipBadge.style.opacity = 0;
  }
}

function handleDragEnd() {
  if (!isDragging) return;
  isDragging = false;

  const threshold = 100;

  if (currentX > threshold) {
    cardElem.style.transition = 'transform 0.3s ease-out';
    cardElem.style.transform = `translate3d(500px, ${currentY}px, 0) rotate(40deg)`;
    setTimeout(() => {
      handleCardGuess();
    }, 200);
  } else if (currentX < -threshold) {
    cardElem.style.transition = 'transform 0.3s ease-out';
    cardElem.style.transform = `translate3d(-500px, ${currentY}px, 0) rotate(-40deg)`;
    setTimeout(() => {
      handleCardSkip();
    }, 200);
  } else {
    resetCardTransform();
  }
}

function resetCardTransform() {
  if (!cardElem) return;
  cardElem.style.transition = 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
  cardElem.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
  
  const guessBadge = document.getElementById('card-badge-guess');
  const skipBadge = document.getElementById('card-badge-skip');
  if (guessBadge) guessBadge.style.opacity = 0;
  if (skipBadge) skipBadge.style.opacity = 0;
}

// --------------------------------------------------------------------------
// 6. ИТОГИ РАУНДА И РЕЗУЛЬТАТЫ ИГРЫ
// --------------------------------------------------------------------------

function showRoundResults() {
  const rIdx = gameState.currentRoundIndex;
  document.getElementById('round-result-title').textContent = `Раунд ${rIdx + 1} завершён!`;
  document.getElementById('round-result-subtitle').textContent = `Все ${gameState.allCards.length} слов в шляпе угаданы!`;

  const sortedTeams = [...gameState.teams].sort((a, b) => b.roundScores[rIdx] - a.roundScores[rIdx]);

  const listContainer = document.getElementById('round-scores-list');
  listContainer.innerHTML = sortedTeams.map((team, idx) => `
    <div class="leaderboard-row">
      <span class="rank-num">${idx + 1}</span>
      <div class="team-info">
        <span class="team-info-name">${escapeHtml(team.name)}</span>
        <span class="team-info-sub">Очки в раунде</span>
      </div>
      <span class="team-points">${team.roundScores[rIdx]}</span>
    </div>
  `).join('');

  const nextBtn = document.getElementById('btn-next-round-step');
  const isFinal = rIdx === ROUNDS.length - 1;
  nextBtn.textContent = isFinal ? '🏆 Объявить победителей' : 'Следующий раунд ➔';

  showScreen('screen-round-results');
}

function showFinalResults() {
  const ranking = [...gameState.teams].sort((a, b) => {
    const totalA = a.roundScores.reduce((s, v) => s + v, 0);
    const totalB = b.roundScores.reduce((s, v) => s + v, 0);
    return totalB - totalA;
  });

  const winner = ranking[0];
  const winnerTotal = winner.roundScores.reduce((s, v) => s + v, 0);

  document.getElementById('winner-team-name').textContent = winner.name;
  document.getElementById('winner-total-score').textContent = `${winnerTotal} очков`;

  const finalContainer = document.getElementById('final-ranking-list');
  finalContainer.innerHTML = ranking.map((team, idx) => {
    const total = team.roundScores.reduce((s, v) => s + v, 0);
    const breakdown = team.roundScores.join(' + ');
    return `
      <div class="leaderboard-row">
        <span class="rank-num">${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}</span>
        <div class="team-info">
          <span class="team-info-name">${escapeHtml(team.name)}</span>
          <span class="team-info-sub">Раунды: ${breakdown}</span>
        </div>
        <span class="team-points">${total}</span>
      </div>
    `;
  }).join('');

  showScreen('screen-game-results');
  triggerConfetti();
}

// --------------------------------------------------------------------------
// 7. ЭФФЕКТ КОНФЕТТИ
// --------------------------------------------------------------------------

function triggerConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#6C4CF1', '#FFB84D', '#10B981', '#EF4444', '#3B82F6', '#EC4899'];

  for (let i = 0; i < 120; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2 - 100,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.8) * 16,
      size: Math.random() * 10 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rSpeed: (Math.random() - 0.5) * 10
    });
  }

  let startTime = Date.now();

  function renderFrame() {
    const elapsed = Date.now() - startTime;
    if (elapsed > 4000) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.3;
      p.rotation += p.rSpeed;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    });

    requestAnimationFrame(renderFrame);
  }

  renderFrame();
}

// --------------------------------------------------------------------------
// 8. ИНИЦИАЛИЗАЦИЯ И ИВЕНТЫ
// --------------------------------------------------------------------------

function initApp() {
  // Main screen Mode Selection
  const btnLocal = document.getElementById('btn-mode-local');
  if (btnLocal) {
    btnLocal.addEventListener('click', () => {
      gameState.playMode = 'local';
      switchSetupMode('random');
      showScreen('screen-setup');
    });
  }

  const btnOnline = document.getElementById('btn-mode-online');
  if (btnOnline) {
    btnOnline.addEventListener('click', () => {
      showScreen('screen-online-hub');
    });
  }

  // Online Hub & Lobby Buttons
  const btnHubBack = document.getElementById('btn-online-hub-back');
  if (btnHubBack) {
    btnHubBack.addEventListener('click', () => showScreen('screen-home'));
  }

  const btnCreateRoom = document.getElementById('btn-create-online-room');
  if (btnCreateRoom) {
    btnCreateRoom.addEventListener('click', createOnlineRoom);
  }

  const btnJoinAction = document.getElementById('btn-join-room-action');
  if (btnJoinAction) {
    btnJoinAction.addEventListener('click', () => {
      const code = document.getElementById('input-room-code-join').value.trim();
      joinOnlineRoom(code);
    });
  }

  const btnLobbyLeave = document.getElementById('btn-lobby-leave');
  if (btnLobbyLeave) {
    btnLobbyLeave.addEventListener('click', () => showScreen('screen-online-hub'));
  }

  const btnShareLink = document.getElementById('btn-share-room-link');
  if (btnShareLink) {
    btnShareLink.addEventListener('click', shareRoomLink);
  }

  const btnHostStartSetup = document.getElementById('btn-host-start-setup');
  if (btnHostStartSetup) {
    btnHostStartSetup.addEventListener('click', () => {
      shuffleRawPairs();
    });
  }

  // Tabs
  const tabRandom = document.getElementById('tab-mode-random');
  const tabManual = document.getElementById('tab-mode-manual');
  if (tabRandom) tabRandom.addEventListener('click', () => switchSetupMode('random'));
  if (tabManual) tabManual.addEventListener('click', () => switchSetupMode('manual'));

  const btnSetupBack = document.getElementById('btn-setup-back');
  if (btnSetupBack) {
    btnSetupBack.addEventListener('click', () => {
      if (gameState.playMode === 'online') {
        showScreen('screen-online-lobby');
      } else {
        showScreen('screen-home');
      }
    });
  }

  const btnOpenRules = document.getElementById('btn-open-rules');
  if (btnOpenRules) {
    btnOpenRules.addEventListener('click', () => {
      document.getElementById('modal-rules').classList.remove('hidden');
    });
  }

  const btnCloseRules = document.getElementById('btn-close-rules');
  if (btnCloseRules) {
    btnCloseRules.addEventListener('click', () => {
      document.getElementById('modal-rules').classList.add('hidden');
    });
  }

  // Random Mode Actions
  const btnAddRandomPlayer = document.getElementById('btn-add-random-player');
  if (btnAddRandomPlayer) btnAddRandomPlayer.addEventListener('click', addRawPlayer);

  const btnShufflePairsAction = document.getElementById('btn-shuffle-pairs-action');
  if (btnShufflePairsAction) btnShufflePairsAction.addEventListener('click', shuffleRawPairs);

  // Steppers
  const btnWM = document.getElementById('btn-words-minus');
  if (btnWM) {
    btnWM.addEventListener('click', () => {
      if (gameState.wordsPerPlayer > 3) {
        gameState.wordsPerPlayer -= 1;
        document.getElementById('val-words-count').textContent = gameState.wordsPerPlayer;
      }
    });
  }

  const btnWP = document.getElementById('btn-words-plus');
  if (btnWP) {
    btnWP.addEventListener('click', () => {
      if (gameState.wordsPerPlayer < 10) {
        gameState.wordsPerPlayer += 1;
        document.getElementById('val-words-count').textContent = gameState.wordsPerPlayer;
      }
    });
  }

  const btnTM = document.getElementById('btn-timer-minus');
  if (btnTM) {
    btnTM.addEventListener('click', () => {
      if (gameState.turnSeconds > 30) {
        gameState.turnSeconds -= 15;
        document.getElementById('val-timer-sec').textContent = `${gameState.turnSeconds} с`;
      }
    });
  }

  const btnTP = document.getElementById('btn-timer-plus');
  if (btnTP) {
    btnTP.addEventListener('click', () => {
      if (gameState.turnSeconds < 120) {
        gameState.turnSeconds += 15;
        document.getElementById('val-timer-sec').textContent = `${gameState.turnSeconds} с`;
      }
    });
  }

  const btnAddTeam = document.getElementById('btn-add-team');
  if (btnAddTeam) {
    btnAddTeam.addEventListener('click', addTeam);
  }

  const btnProceedWords = document.getElementById('btn-proceed-words');
  if (btnProceedWords) {
    btnProceedWords.addEventListener('click', () => {
      startWordEntry();
    });
  }

  const btnReveal = document.getElementById('btn-reveal-entry');
  if (btnReveal) {
    btnReveal.addEventListener('click', revealWordEntryForm);
  }

  const btnSubmitWords = document.getElementById('btn-submit-words');
  if (btnSubmitWords) {
    btnSubmitWords.addEventListener('click', submitCurrentPlayerWords);
  }

  const btnStartTurn = document.getElementById('btn-start-turn');
  if (btnStartTurn) {
    btnStartTurn.addEventListener('click', startTurn);
  }

  const btnGuess = document.getElementById('btn-guess-card');
  if (btnGuess) {
    btnGuess.addEventListener('click', handleCardGuess);
  }

  const btnSkip = document.getElementById('btn-skip-card');
  if (btnSkip) {
    btnSkip.addEventListener('click', handleCardSkip);
  }

  const btnNextRound = document.getElementById('btn-next-round-step');
  if (btnNextRound) {
    btnNextRound.addEventListener('click', () => {
      if (gameState.currentRoundIndex < ROUNDS.length - 1) {
        startRound(gameState.currentRoundIndex + 1);
      } else {
        showFinalResults();
      }
    });
  }

  const btnRestart = document.getElementById('btn-restart-game');
  if (btnRestart) {
    btnRestart.addEventListener('click', () => {
      showScreen('screen-home');
    });
  }

  // Initialize Swiper
  initSwipeCard();

  // Check URL Deeplinks
  checkUrlRoomCode();
}

// Гарантированная инициализация
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
