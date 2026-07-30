import assert from 'node:assert/strict';

const baseUrl = process.env.GAME_WS_URL || 'ws://127.0.0.1:8787';

function roomUrl(code, playerId, name, role) {
  const query = new URLSearchParams({ playerId, name, role });
  return `${baseUrl}/rooms/${code}?${query}`;
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error(`Timeout opening ${url}`)), 4000);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(socket);
    }, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

function nextMessage(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error('Timeout waiting for WebSocket message'));
    }, 4000);
    const onMessage = event => {
      const data = JSON.parse(event.data);
      if (!predicate(data)) return;
      clearTimeout(timer);
      socket.removeEventListener('message', onMessage);
      resolve(data);
    };
    socket.addEventListener('message', onMessage);
  });
}

const code = String(Math.floor(1000 + Math.random() * 9000));
const host = await openSocket(roomUrl(code, 'host-1', 'Ведущий', 'host'));
const guest = await openSocket(roomUrl(code, 'guest-1', 'Игрок', 'guest'));

host.send(JSON.stringify({ type: 'request_sync' }));
const hostPlayers = await nextMessage(host, message => message.type === 'sync_players' && message.players.length === 2);
assert.deepEqual(hostPlayers.players.map(player => player.id).sort(), ['guest-1', 'host-1']);

const submissionPromise = nextMessage(host, message => message.type === 'submit_words');
guest.send(JSON.stringify({ type: 'submit_words', playerId: 'spoofed', words: ['аист'] }));
const submission = await submissionPromise;
assert.equal(submission.playerId, 'guest-1');
assert.equal(submission.senderId, 'guest-1');

const startPromise = nextMessage(guest, message => message.type === 'start_game');
host.send(JSON.stringify({ type: 'start_game', teams: [{ name: 'Команда' }] }));
const start = await startPromise;
assert.equal(start.teams[0].name, 'Команда');

const collision = await openSocket(roomUrl(code, 'host-2', 'Другой ведущий', 'host'));
const collisionError = await nextMessage(collision, message => message.type === 'room_error');
assert.equal(collisionError.error, 'room_exists');

const missing = await openSocket(roomUrl('0001', 'guest-2', 'Опоздавший', 'guest'));
const missingError = await nextMessage(missing, message => message.type === 'room_error');
assert.equal(missingError.error, 'room_missing');

for (const socket of [missing, collision, guest, host]) {
  try { socket.close(1000, 'Test complete'); } catch (_) {}
}

console.log('Realtime smoke test passed: lobby, relay, validation and room errors.');
