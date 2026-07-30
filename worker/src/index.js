const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS'
};

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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({ ok: true, service: 'slovo-v-shlyape-realtime', version: '2.4.0' });
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
    return this.getConnections().find(({ member }) => member.isHost);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const playerId = safeText(url.searchParams.get('playerId'), 80);
    const name = safeText(url.searchParams.get('name'), 40);
    const isHost = url.searchParams.get('role') === 'host';

    if (!playerId || !name) return jsonResponse({ ok: false, error: 'invalid_player' }, 400);

    const currentHost = this.getHost();
    const roomError = isHost && currentHost && currentHost.member.playerId !== playerId
      ? 'room_exists'
      : (!isHost && !currentHost ? 'room_missing' : null);

    if (roomError) {
      const rejectedPair = new WebSocketPair();
      const [rejectedClient, rejectedServer] = Object.values(rejectedPair);
      this.ctx.acceptWebSocket(rejectedServer);
      rejectedServer.serializeAttachment({ rejected: true });
      queueMicrotask(() => {
        safeSend(rejectedServer, { type: 'room_error', error: roomError });
        try { rejectedServer.close(roomError === 'room_exists' ? 4002 : 4003, roomError); } catch (_) {}
      });
      return new Response(null, { status: 101, webSocket: rejectedClient });
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

    safeSend(server, { type: 'connected', playerId, isHost, version: '2.4.0' });
    this.broadcastPlayers();

    return new Response(null, { status: 101, webSocket: client });
  }

  publicPlayers(excludedSocket = null) {
    const unique = new Map();
    for (const { socket, member } of this.getConnections()) {
      if (socket === excludedSocket || member.rejected) continue;
      if (!member.playerId) continue;
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

    const envelope = { ...message, senderId: sender.playerId };
    if (!sender.isHost && message.type === 'submit_words') {
      envelope.playerId = sender.playerId;
      envelope.name = sender.name;
    }
    for (const { socket: target, member } of this.getConnections()) {
      if (target === socket) continue;
      if (sender.isHost && !member.isHost) safeSend(target, envelope);
      if (!sender.isHost && member.isHost) safeSend(target, envelope);
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
