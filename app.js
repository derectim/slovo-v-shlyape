/**
 * «Слово в шляпе» — Полная логика веб-игры с анимированными свайпами, таймером и конфетти.
 */

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

// Состояние Игры (Game State)
let gameState = {
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
// 1. НАСТРОЙКА ИГРЫ И СТРОГИЕ ПАРЫ ПО 2 ИГРОКА (SETUP & PAIRS)
// --------------------------------------------------------------------------

function renderSetupTeams() {
  const container = document.getElementById('teams-container');
  if (!container) return;
  container.innerHTML = '';

  gameState.teams.forEach((team, tIdx) => {
    const card = document.createElement('div');
    card.className = 'team-card';

    let playersHtml = team.playerNames.map((pName, pIdx) => `
      <div class="player-row">
        <input type="text" class="input-field" value="${escapeHtml(pName)}" onchange="updatePlayerName(${tIdx}, ${pIdx}, this.value)">
        ${team.playerNames.length > 2 ? `<button class="btn-icon-only" onclick="removePlayer(${tIdx}, ${pIdx})">✕</button>` : ''}
      </div>
    `).join('');

    card.innerHTML = `
      <div class="team-header">
        <input type="text" class="input-field input-team-name" value="${escapeHtml(team.name)}" onchange="updateTeamName(${tIdx}, this.value)">
        ${gameState.teams.length > 2 ? `<button class="btn-icon-only" onclick="removeTeam(${tIdx})">🗑</button>` : ''}
      </div>
      <div class="players-list">
        ${playersHtml}
        ${team.playerNames.length < 2 ? `<button class="btn-add-player" onclick="addPlayer(${tIdx})">+ Добавить игрока</button>` : ''}
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

function addPlayer(tIdx) {
  if (gameState.teams[tIdx].playerNames.length < 2) {
    const count = gameState.teams[tIdx].playerNames.length + 1;
    gameState.teams[tIdx].playerNames.push(`Игрок ${count}`);
    renderSetupTeams();
  }
}

function removePlayer(tIdx, pIdx) {
  if (gameState.teams[tIdx].playerNames.length > 2) {
    gameState.teams[tIdx].playerNames.splice(pIdx, 1);
    renderSetupTeams();
  }
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
    renderSetupTeams();
  }
}

function removeTeam(tIdx) {
  if (gameState.teams.length > 2) {
    gameState.teams.splice(tIdx, 1);
    renderSetupTeams();
  }
}

// Перемешать всех участников по парам (по 2 человека)
function shufflePlayers() {
  const allNames = gameState.teams.flatMap(t => t.playerNames).map(n => n.trim()).filter(n => n.length > 0);

  // Перемешивание Fisher-Yates
  for (let i = allNames.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allNames[i], allNames[j]] = [allNames[j], allNames[i]];
  }

  // Пересобираем команды строго по 2 человека
  gameState.teams = [];
  for (let i = 0; i < allNames.length; i += 2) {
    const teamNum = (i / 2) + 1;
    const p1 = allNames[i];
    const p2 = allNames[i + 1] || `Игрок ${i + 2}`;
    gameState.teams.push({
      name: `Команда ${teamNum}`,
      playerNames: [p1, p2],
      roundScores: [0, 0, 0],
      explainerCursor: 0
    });
  }

  renderSetupTeams();
}

// --------------------------------------------------------------------------
// 2. ВВОД СЛОВ (WORD ENTRY)
// --------------------------------------------------------------------------

function startWordEntry() {
  gameState.wordEntryPlayerIndex = 0;
  gameState.allCards = [];
  renderWordEntryPlayer();
  showScreen('screen-word-entry');
}

function renderWordEntryPlayer() {
  const allPlayers = getAllPlayers();
  const player = allPlayers[gameState.wordEntryPlayerIndex];
  
  // Progress
  const progressPercent = ((gameState.wordEntryPlayerIndex + 1) / allPlayers.length) * 100;
  document.getElementById('word-entry-progress').style.width = `${progressPercent}%`;

  // Privacy Shield
  document.getElementById('privacy-player-name').textContent = player.name;
  document.getElementById('privacy-shield').classList.remove('hidden');
  document.getElementById('words-form-container').classList.add('hidden');

  // Form info
  document.getElementById('entry-current-player-name').textContent = player.name;
  document.getElementById('entry-current-team-name').textContent = player.teamName;

  // Build input fields
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

  // Save words into cards pool
  words.forEach(word => {
    gameState.allCards.push({ id: Math.random().toString(36).substr(2, 9), word });
  });

  const allPlayers = getAllPlayers();
  if (gameState.wordEntryPlayerIndex < allPlayers.length - 1) {
    gameState.wordEntryPlayerIndex += 1;
    renderWordEntryPlayer();
  } else {
    // Finish word entry -> Start Round 1
    startRound(0);
  }
}

// --------------------------------------------------------------------------
// 3. УПРАВЛЕНИЕ РАУНДАМИ
// --------------------------------------------------------------------------

function startRound(roundIndex) {
  gameState.currentRoundIndex = roundIndex;
  gameState.activeTeamIndex = 0;

  // Reset deck with shuffled cards from allCards pool
  gameState.deck = [...gameState.allCards].sort(() => Math.random() - 0.5);

  renderRoundIntro();
  showScreen('screen-round-intro');
}

function renderRoundIntro() {
  const round = ROUNDS[gameState.currentRoundIndex];
  const activeTeam = gameState.teams[gameState.activeTeamIndex];
  const explainerName = activeTeam.playerNames[activeTeam.explainerCursor % activeTeam.playerNames.length];

  document.getElementById('round-badge').textContent = `РАУНД ${gameState.currentRoundIndex + 1} ИЗ 3`;
  document.getElementById('round-title').textContent = round.title;
  document.getElementById('round-description').textContent = round.description;

  document.getElementById('intro-total-words-badge').textContent = `🎩 В шляпе: ${gameState.allCards.length} слов`;

  document.getElementById('intro-team-name').textContent = activeTeam.name;
  document.getElementById('intro-explainer-name').textContent = `Объясняет: ${explainerName}`;

  // Mini Scoreboard
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
// 4. ИГРОВОЙ ХОД И ИНТЕРАКТИВНЫЕ СВАЙПЫ (TURN SCREEN)
// --------------------------------------------------------------------------

function startTurn() {
  gameState.turnGuessedCount = 0;
  gameState.secondsLeft = gameState.turnSeconds;
  drawNextCard();

  const activeTeam = gameState.teams[gameState.activeTeamIndex];
  document.getElementById('turn-active-team').textContent = activeTeam.name;
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

  // Reset Card Transform
  resetCardTransform();
}

function handleCardGuess() {
  if (!gameState.currentCard) return;

  // Add score to active team
  gameState.teams[gameState.activeTeamIndex].roundScores[gameState.currentRoundIndex] += 1;
  gameState.turnGuessedCount += 1;

  gameState.currentCard = null;

  if (gameState.deck.length === 0) {
    // All words in the hat for this round are guessed! Round ends!
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

  // Re-insert into random position in deck
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

  // Next explainer in team
  const activeTeam = gameState.teams[gameState.activeTeamIndex];
  activeTeam.explainerCursor += 1;

  // Next team turn
  gameState.activeTeamIndex = (gameState.activeTeamIndex + 1) % gameState.teams.length;

  if (roundCompleted) {
    showRoundResults();
  } else {
    renderRoundIntro();
    showScreen('screen-round-intro');
  }
}

// Таймер Хода
function startTimer() {
  clearInterval(gameState.timerInterval);
  const timerWidget = document.querySelector('.timer-widget');
  const timerCircle = document.getElementById('timer-progress-circle');
  const timerText = document.getElementById('timer-text');
  const totalCircleLen = 276.46; // 2 * PI * 44

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
// 5. ЖЕСТЫ И СВАЙПЫ КАРТОЧКИ (GESTURE CONTROLLER)
// --------------------------------------------------------------------------

let cardElem, startX = 0, startY = 0, currentX = 0, currentY = 0, isDragging = false;

function initSwipeCard() {
  cardElem = document.getElementById('swipe-card');
  if (!cardElem) return;

  // Touch Events
  cardElem.addEventListener('touchstart', handleDragStart, { passive: true });
  cardElem.addEventListener('touchmove', handleDragMove, { passive: false });
  cardElem.addEventListener('touchend', handleDragEnd);

  // Mouse Events
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

  // Swipe Indicators Opacity
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
    // Animate Away Right (Guess)
    cardElem.style.transition = 'transform 0.3s ease-out';
    cardElem.style.transform = `translate3d(500px, ${currentY}px, 0) rotate(40deg)`;
    setTimeout(() => {
      handleCardGuess();
    }, 200);
  } else if (currentX < -threshold) {
    // Animate Away Left (Skip)
    cardElem.style.transition = 'transform 0.3s ease-out';
    cardElem.style.transform = `translate3d(-500px, ${currentY}px, 0) rotate(-40deg)`;
    setTimeout(() => {
      handleCardSkip();
    }, 200);
  } else {
    // Spring back
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
  // Sort by total scores
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
// 7. ЭФФЕКТ КОНФЕТТИ (CANVAS CONFETTI EFFECT)
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
      p.vy += 0.3; // Gravity
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
// 8. ИНИЦИАЛИЗАЦИЯ И ИВЕНТЫ (БЕЗ БЛОКИРОВКИ ЗАГРУЗКИ)
// --------------------------------------------------------------------------

function initApp() {
  // Navigation & Buttons
  const btnStart = document.getElementById('btn-start-game');
  if (btnStart) {
    btnStart.addEventListener('click', () => {
      renderSetupTeams();
      showScreen('screen-setup');
    });
  }

  const btnSetupBack = document.getElementById('btn-setup-back');
  if (btnSetupBack) {
    btnSetupBack.addEventListener('click', () => {
      showScreen('screen-home');
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

  const btnShuffle = document.getElementById('btn-shuffle-players');
  if (btnShuffle) {
    btnShuffle.addEventListener('click', shufflePlayers);
  }

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
}

// Гарантированная инициализация независимо от типа загрузки браузера
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
