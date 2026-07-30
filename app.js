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
  rawPlayerNames: ['Игрок 1', 'Игрок 2', 'Игрок 3', 'Игрок 4'],
  teams: [],
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
// 1. СБОР ИМЁН И СЛУЧАЙНЫЙ РАЗБРОС НА ПАРЫ (PLAYERS & PAIR TEAMS)
// --------------------------------------------------------------------------

function renderSetupPlayers() {
  const container = document.getElementById('players-input-list');
  container.innerHTML = '';

  gameState.rawPlayerNames.forEach((name, idx) => {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `
      <input type="text" class="input-field player-name-input" value="${escapeHtml(name)}" onchange="updateRawPlayerName(${idx}, this.value)">
      ${gameState.rawPlayerNames.length > 4 ? `<button class="btn-icon-only" onclick="removePlayerField(${idx})">✕</button>` : ''}
    `;
    container.appendChild(row);
  });
}

function updateRawPlayerName(idx, value) {
  if (value.trim()) gameState.rawPlayerNames[idx] = value.trim();
}

function addPlayerField() {
  const num = gameState.rawPlayerNames.length + 1;
  gameState.rawPlayerNames.push(`Игрок ${num}`);
  renderSetupPlayers();
}

function removePlayerField(idx) {
  if (gameState.rawPlayerNames.length > 4) {
    gameState.rawPlayerNames.splice(idx, 1);
    renderSetupPlayers();
  }
}

// Генерация рандомных команд ровно по 2 человека
function generateRandomPairTeams() {
  const validNames = gameState.rawPlayerNames.map(n => n.trim()).filter(n => n.length > 0);

  if (validNames.length < 4) {
    alert('Минимум 4 участника для игры командами по 2 человека!');
    return;
  }

  // Если нечетное количество — добавляем 1 имя для парности
  if (validNames.length % 2 !== 0) {
    validNames.push(`Игрок ${validNames.length + 1}`);
  }

  // Случайное перемешивание (Fisher-Yates Shuffle)
  for (let i = validNames.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [validNames[i], validNames[j]] = [validNames[j], validNames[i]];
  }

  // Формируем команды по 2 человека
  gameState.teams = [];
  for (let i = 0; i < validNames.length; i += 2) {
    const teamNum = (i / 2) + 1;
    gameState.teams.push({
      name: `Команда ${teamNum}`,
      playerNames: [validNames[i], validNames[i + 1]],
      roundScores: [0, 0, 0],
      explainerCursor: 0
    });
  }

  renderTeamsPreview();
  showScreen('screen-teams-preview');
}

function renderTeamsPreview() {
  const container = document.getElementById('generated-teams-list');
  container.innerHTML = gameState.teams.map(team => `
    <div class="pair-team-card">
      <span class="pair-team-name">${escapeHtml(team.name)}</span>
      <span class="pair-players">🤝 ${escapeHtml(team.playerNames[0])} и ${escapeHtml(team.playerNames[1])}</span>
    </div>
  `).join('');
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

  timerWidget.classList.remove('warning', 'danger');

  gameState.timerInterval = setInterval(() => {
    gameState.secondsLeft -= 1;
    timerText.textContent = gameState.secondsLeft;

    const progressRatio = gameState.secondsLeft / gameState.turnSeconds;
    const dashOffset = totalCircleLen * (1 - progressRatio);
    timerCircle.style.strokeDashoffset = dashOffset;

    if (gameState.secondsLeft <= 15 && gameState.secondsLeft > 10) {
      timerWidget.classList.add('warning');
    } else if (gameState.secondsLeft <= 10) {
      timerWidget.classList.remove('warning');
      timerWidget.classList.add('danger');
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
    guessBadge.style.opacity = Math.min(currentX / 100, 1);
    skipBadge.style.opacity = 0;
  } else if (currentX < -30) {
    skipBadge.style.opacity = Math.min(Math.abs(currentX) / 100, 1);
    guessBadge.style.opacity = 0;
  } else {
    guessBadge.style.opacity = 0;
    skipBadge.style.opacity = 0;
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
// 8. ИНИЦИАЛИЗАЦИЯ И ИВЕНТЫ
// --------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Navigation & Buttons
  document.getElementById('btn-start-game').addEventListener('click', () => {
    renderSetupPlayers();
    showScreen('screen-setup');
  });

  document.getElementById('btn-setup-back').addEventListener('click', () => {
    showScreen('screen-home');
  });

  document.getElementById('btn-open-rules').addEventListener('click', () => {
    document.getElementById('modal-rules').classList.remove('hidden');
  });

  document.getElementById('btn-close-rules').addEventListener('click', () => {
    document.getElementById('modal-rules').classList.add('hidden');
  });

  document.getElementById('btn-add-player-field').addEventListener('click', addPlayerField);

  document.getElementById('btn-generate-teams').addEventListener('click', generateRandomPairTeams);
  document.getElementById('btn-confirm-teams').addEventListener('click', startWordEntry);

  // Steppers
  document.getElementById('btn-words-minus').addEventListener('click', () => {
    if (gameState.wordsPerPlayer > 3) {
      gameState.wordsPerPlayer -= 1;
      document.getElementById('val-words-count').textContent = gameState.wordsPerPlayer;
    }
  });

  document.getElementById('btn-words-plus').addEventListener('click', () => {
    if (gameState.wordsPerPlayer < 10) {
      gameState.wordsPerPlayer += 1;
      document.getElementById('val-words-count').textContent = gameState.wordsPerPlayer;
    }
  });

  document.getElementById('btn-timer-minus').addEventListener('click', () => {
    if (gameState.turnSeconds > 30) {
      gameState.turnSeconds -= 15;
      document.getElementById('val-timer-sec').textContent = `${gameState.turnSeconds} с`;
    }
  });

  document.getElementById('btn-timer-plus').addEventListener('click', () => {
    if (gameState.turnSeconds < 120) {
      gameState.turnSeconds += 15;
      document.getElementById('val-timer-sec').textContent = `${gameState.turnSeconds} с`;
    }
  });

  document.getElementById('btn-reveal-entry').addEventListener('click', revealWordEntryForm);
  document.getElementById('btn-submit-words').addEventListener('click', submitCurrentPlayerWords);

  document.getElementById('btn-start-turn').addEventListener('click', startTurn);

  document.getElementById('btn-guess-card').addEventListener('click', handleCardGuess);
  document.getElementById('btn-skip-card').addEventListener('click', handleCardSkip);

  document.getElementById('btn-next-round-step').addEventListener('click', () => {
    if (gameState.currentRoundIndex < ROUNDS.length - 1) {
      startRound(gameState.currentRoundIndex + 1);
    } else {
      showFinalResults();
    }
  });

  document.getElementById('btn-restart-game').addEventListener('click', () => {
    showScreen('screen-home');
  });

  // Initialize Swiper
  initSwipeCard();
});
