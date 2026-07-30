const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS'
};

const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const META_KEY = 'room_meta';
const GAME_KEY = 'game_state';
const SUBMISSIONS_KEY = 'word_submissions';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function safeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function safeSend(socket, payload) {
  try {
    socket.send(JSON.stringify(payload));
  } catch (_) {
    // A closing socket is removed by the runtime shortly afterwards.
  }
}

function isValidWords(words) {
  return Array.isArray(words)
    && words.length > 0
    && words.length <= 20
    && words.every(word => typeof word === 'string' && word.trim().length > 0 && word.length <= 100);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({ ok: true, service: 'slovo-v-shlyape-realtime', version: '2.5.0' });
    }

    const match = url.pathname.match(/^\/rooms\/(\d{4})$/);
    if (!match) return jsonResponse({ ok: false, error: 'not_found' }, 404);
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return jsonResponse({ ok: false, error: 'websocket_required' }, 426);
    }

    const room = env.GAME_ROOMS.getByName(match[1]);
    return room.fetch(request);
  }
};

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  getConnections() {
    return this.ctx.getWebSockets().map(socket => ({
      socket,
      member: socket.deserializeAttachment() || {}
    }));
  }

  getHost() {
    return this.getConnections().find(({ member }) => member.isHost && !member.rejected);
  }

  async getRoomMeta() {
    const meta = await this.ctx.storage.get(META_KEY);
    if (!meta) return null;
    if (Date.now() - Number(meta.updatedAt || meta.createdAt || 0) <= ROOM_TTL_MS) return meta;
    await this.ctx.storage.deleteAll();
    return null;
  }

  async touchRoomMeta(patch = {}) {
    const current = await this.ctx.storage.get(META_KEY) || {};
    const next = { ...current, ...patch, updatedAt: Date.now() };
    await this.ctx.storage.put(META_KEY, next);
    return next;
  }

  rejectSocket(error) {
    const rejectedPair = new WebSocketPair();
    const [rejectedClient, rejectedServer] = Object.values(rejectedPair);
    this.ctx.acceptWebSocket(rejectedServer);
    rejectedServer.serializeAttachment({ rejected: true });
    queueMicrotask(() => {
      safeSend(rejectedServer, { type: 'room_error', error });
      try { rejectedServer.close(error === 'room_exists' ? 4002 : 4003, error); } catch (_) {}
    });
    return new Response(null, { status: 101, webSocket: rejectedClient });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const playerId = safeText(url.searchParams.get('playerId'), 80);
    const name = safeText(url.searchParams.get('name'), 40);
    const isHost = url.searchParams.get('role') === 'host';

    if (!playerId || !name) return jsonResponse({ ok: false, error: 'invalid_player' }, 400);

    let meta = await this.getRoomMeta();
    if (isHost) {
      if (meta && meta.hostId !== playerId) return this.rejectSocket('room_exists');
      if (!meta) {
        meta = {
          hostId: playerId,
          hostName: name,
          phase: 'lobby',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        await this.ctx.storage.put(META_KEY, meta);
      } else {
        await this.touchRoomMeta({ hostName: name });
      }
    } else if (!meta) {
      return this.rejectSocket('room_missing');
    }

    // A reconnect replaces the stale socket for the same player.
    for (const { socket, member } of this.getConnections()) {
      if (member.playerId === playerId) {
        try { socket.close(4001, 'Reconnected'); } catch (_) {}
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId, name, isHost, connectedAt: Date.now() });

    safeSend(server, { type: 'connected', playerId, isHost, version: '2.5.0' });
    this.broadcastPlayers();

    return new Response(null, { status: 101, webSocket: client });
  }

  publicPlayers(excludedSocket = null) {
    const unique = new Map();
    for (const { socket, member } of this.getConnections()) {
      if (socket === excludedSocket || member.rejected || !member.playerId) continue;
      unique.set(member.playerId, {
        id: member.playerId,
        name: member.name,
        isHost: Boolean(member.isHost)
      });
    }
    return [...unique.values()].sort((a, b) => Number(b.isHost) - Number(a.isHost));
  }

  broadcastPlayers(excludedSocket = null) {
    const payload = { type: 'sync_players', players: this.publicPlayers(excludedSocket) };
    for (const { socket, member } of this.getConnections()) {
      if (socket !== excludedSocket && !member.rejected) safeSend(socket, payload);
    }
  }

  async getSubmissions() {
    return await this.ctx.storage.get(SUBMISSIONS_KEY) || {};
  }

  async storeSubmission(playerId, name, words, submissionId) {
    const submissions = await this.getSubmissions();
    submissions[playerId] = {
      playerId,
      name: safeText(name, 40),
      words: words.map(word => safeText(word, 100)),
      submissionId: safeText(submissionId, 120),
      updatedAt: Date.now()
    };
    await this.ctx.storage.put(SUBMISSIONS_KEY, submissions);
    await this.touchRoomMeta();
    return submissions;
  }

  async sendRoomSnapshot(socket, isHost) {
    const meta = await this.getRoomMeta();
    if (!meta) return;
    const game = await this.ctx.storage.get(GAME_KEY) || null;
    const submissions = await this.getSubmissions();
    const payload = {
      type: 'room_snapshot',
      phase: game?.phase || meta.phase || 'lobby',
      game,
      players: this.publicPlayers(),
      submittedPlayerIds: Object.keys(submissions),
      submitted: Object.keys(submissions).length,
      wordSubmissions: isHost ? submissions : undefined,
      expiresAt: Number(meta.updatedAt || Date.now()) + ROOM_TTL_MS
    };
    safeSend(socket, payload);
  }

  async saveGame(game) {
    const stored = { ...game, updatedAt: Date.now() };
    await this.ctx.storage.put(GAME_KEY, stored);
    await this.touchRoomMeta({ phase: stored.phase });
    return stored;
  }

  async persistHostMessage(message) {
    if (message.type === 'start_game') {
      await this.ctx.storage.delete(SUBMISSIONS_KEY);
      await this.ctx.storage.deleteAlarm();
      await this.saveGame({
        phase: 'word_entry',
        teams: message.teams,
        wordsPerPlayer: Number(message.wordsPerPlayer) || 5,
        turnSeconds: Number(message.turnSeconds) || 60,
        state: null,
        deadline: 0,
        acknowledgedActionId: null
      });
      return;
    }

    if (message.type === 'game_ready') {
      await this.saveGame({
        phase: 'round_intro',
        teams: message.teams,
        wordsPerPlayer: Number(message.wordsPerPlayer) || 5,
        turnSeconds: Number(message.turnSeconds) || 60,
        state: {
          teams: message.teams,
          allCards: message.allCards,
          deck: message.deck,
          currentCard: null,
          currentRoundIndex: 0,
          activeTeamIndex: 0,
          turnGuessedCount: 0
        },
        deadline: 0,
        acknowledgedActionId: message.acknowledgedActionId || null
      });
      return;
    }

    const stateMessages = new Set([
      'round_started',
      'turn_started',
      'turn_state',
      'turn_finished',
      'game_finished'
    ]);
    if (!stateMessages.has(message.type) || !message.state) return;

    let phase = 'round_intro';
    if (message.type === 'turn_started' || message.type === 'turn_state') phase = 'turn';
    if (message.type === 'turn_finished') phase = message.roundCompleted ? 'round_results' : 'round_intro';
    if (message.type === 'game_finished') phase = 'game_results';

    const previous = await this.ctx.storage.get(GAME_KEY) || {};
    const saved = await this.saveGame({
      ...previous,
      phase,
      state: message.state,
      deadline: phase === 'turn' ? Number(message.deadline) || previous.deadline || 0 : 0,
      acknowledgedActionId: message.acknowledgedActionId || previous.acknowledgedActionId || null
    });

    if (phase === 'turn' && saved.deadline > Date.now()) {
      await this.ctx.storage.setAlarm(saved.deadline);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  async sendGameSync(socket, pendingActionId = null) {
    const game = await this.ctx.storage.get(GAME_KEY);
    if (!game || !game.state) {
      await this.sendRoomSnapshot(socket, Boolean((socket.deserializeAttachment() || {}).isHost));
      return;
    }
    safeSend(socket, {
      type: 'game_sync',
      phase: game.phase,
      state: game.state,
      deadline: game.deadline || 0,
      acknowledgedActionId: pendingActionId && game.acknowledgedActionId === pendingActionId
        ? pendingActionId
        : game.acknowledgedActionId || null
    });
  }

  async webSocketMessage(socket, rawMessage) {
    if (typeof rawMessage !== 'string' || rawMessage.length > 250000) return;

    let message;
    try { message = JSON.parse(rawMessage); } catch (_) { return; }
    if (!message || typeof message !== 'object') return;

    const sender = socket.deserializeAttachment() || {};
    if (message.type === 'heartbeat') {
      safeSend(socket, { type: 'heartbeat_ack', at: Date.now() });
      return;
    }
    if (message.type === 'request_sync') {
      safeSend(socket, { type: 'sync_players', players: this.publicPlayers() });
      return;
    }
    if (message.type === 'request_room_snapshot') {
      await this.sendRoomSnapshot(socket, Boolean(sender.isHost));
      return;
    }
    if (message.type === 'request_turn_sync') {
      await this.sendGameSync(socket, safeText(message.pendingActionId, 120));
      return;
    }

    if (!sender.isHost && message.type === 'turn_action' && message.actionId) {
      const game = await this.ctx.storage.get(GAME_KEY);
      if (game?.acknowledgedActionId === safeText(message.actionId, 120)) {
        await this.sendGameSync(socket, safeText(message.actionId, 120));
        return;
      }
    }

    if (sender.isHost && message.type === 'store_host_words') {
      if (!isValidWords(message.words)) return;
      const game = await this.ctx.storage.get(GAME_KEY);
      if (!game || game.phase !== 'word_entry'
        || message.words.length !== Number(game.wordsPerPlayer || 5)) return;
      await this.storeSubmission(sender.playerId, sender.name, message.words, message.submissionId);
      safeSend(socket, {
        type: 'submission_received',
        submissionId: safeText(message.submissionId, 120)
      });
      return;
    }

    const envelope = { ...message, senderId: sender.playerId };
    if (!sender.isHost && message.type === 'submit_words') {
      if (!isValidWords(message.words)) return;
      const game = await this.ctx.storage.get(GAME_KEY);
      if (!game || game.phase !== 'word_entry'
        || message.words.length !== Number(game.wordsPerPlayer || 5)) return;
      envelope.playerId = sender.playerId;
      envelope.name = sender.name;
      await this.storeSubmission(sender.playerId, sender.name, message.words, message.submissionId);
      safeSend(socket, {
        type: 'submission_received',
        submissionId: safeText(message.submissionId, 120)
      });
    }

    if (sender.isHost) await this.persistHostMessage(message);

    for (const { socket: target, member } of this.getConnections()) {
      if (target === socket) continue;
      if (sender.isHost && !member.isHost) {
        if (!envelope.targetPlayerId || envelope.targetPlayerId === member.playerId) {
          safeSend(target, envelope);
        }
      }
      if (!sender.isHost && member.isHost) safeSend(target, envelope);
    }
  }

  async alarm() {
    const game = await this.ctx.storage.get(GAME_KEY);
    if (!game || game.phase !== 'turn' || !game.state) return;
    if (Number(game.deadline) > Date.now() + 250) {
      await this.ctx.storage.setAlarm(Number(game.deadline));
      return;
    }

    const state = structuredClone(game.state);
    if (state.currentCard) {
      state.deck = Array.isArray(state.deck) ? state.deck : [];
      state.deck.push(state.currentCard);
      state.deck.sort(() => Math.random() - 0.5);
      state.currentCard = null;
    }

    const teams = Array.isArray(state.teams) ? state.teams : [];
    const activeTeamIndex = Number.isInteger(state.activeTeamIndex) ? state.activeTeamIndex : 0;
    if (teams[activeTeamIndex]) {
      teams[activeTeamIndex].explainerCursor = Number(teams[activeTeamIndex].explainerCursor || 0) + 1;
    }
    state.activeTeamIndex = teams.length ? (activeTeamIndex + 1) % teams.length : 0;

    const saved = await this.saveGame({
      ...game,
      phase: 'round_intro',
      state,
      deadline: 0
    });

    const payload = {
      type: 'game_sync',
      phase: saved.phase,
      state: saved.state,
      deadline: 0,
      serverRecovered: true
    };
    for (const { socket, member } of this.getConnections()) {
      if (!member.rejected) safeSend(socket, payload);
    }
  }

  async webSocketClose(socket, code, reason) {
    try { socket.close(code, reason); } catch (_) {}
    this.broadcastPlayers(socket);
  }

  async webSocketError(socket) {
    try { socket.close(1011, 'WebSocket error'); } catch (_) {}
    this.broadcastPlayers(socket);
  }
}
