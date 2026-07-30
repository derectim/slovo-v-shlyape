import assert from 'node:assert/strict';

const baseUrl = process.argv[2] || process.env.GAME_WS_URL || 'ws://127.0.0.1:8787';

function roomUrl(code, playerId, name, role) {
  const query = new URLSearchParams({ playerId, name, role });
  return `${baseUrl}/rooms/${code}?${query}`;
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error(`Timeout opening ${url}`)), 5000);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(socket);
    }, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

function nextMessage(socket, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error('Timeout waiting for WebSocket message'));
    }, timeoutMs);
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

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const code = String(Math.floor(1000 + Math.random() * 9000));
const missingCode = String((Number(code) + 4000) % 9000 + 1000).slice(-4);
const teams = [
  { name: 'Команда 1', playerNames: ['Ведущий', 'Игрок'], playerIds: ['host-1', 'guest-1'], roundScores: [0, 0, 0], explainerCursor: 0 },
  { name: 'Команда 2', playerNames: ['Зритель', 'Напарник'], playerIds: ['guest-2', 'guest-3'], roundScores: [0, 0, 0], explainerCursor: 0 }
];

let host = await openSocket(roomUrl(code, 'host-1', 'Ведущий', 'host'));
const guest = await openSocket(roomUrl(code, 'guest-1', 'Игрок', 'guest'));

const hostPlayersPromise = nextMessage(host, message => message.type === 'sync_players' && message.players.length === 2);
host.send(JSON.stringify({ type: 'request_sync' }));
const hostPlayers = await hostPlayersPromise;
assert.deepEqual(hostPlayers.players.map(player => player.id).sort(), ['guest-1', 'host-1']);

const startPromise = nextMessage(guest, message => message.type === 'start_game');
host.send(JSON.stringify({ type: 'start_game', teams, wordsPerPlayer: 1, turnSeconds: 60 }));
const start = await startPromise;
assert.equal(start.teams[0].name, 'Команда 1');

const outsider = await openSocket(roomUrl(code, 'outsider-1', 'Опоздавший', 'guest'));
const outsiderRejectedPromise = nextMessage(outsider, message => message.type === 'submission_rejected');
const outsiderReachedHost = nextMessage(host, message => message.type === 'submit_words' && message.senderId === 'outsider-1', 800)
  .then(() => true, () => false);
outsider.send(JSON.stringify({
  type: 'submit_words',
  submissionId: 'submission-outsider',
  words: ['лишнее']
}));
assert.equal((await outsiderRejectedPromise).reason, 'not_in_game');
assert.equal(await outsiderReachedHost, false);

const submissionPromise = nextMessage(host, message => message.type === 'submit_words');
const receiptPromise = nextMessage(guest, message => message.type === 'submission_received');
guest.send(JSON.stringify({
  type: 'submit_words',
  playerId: 'spoofed',
  submissionId: 'submission-guest',
  words: ['аист']
}));
const submission = await submissionPromise;
const receipt = await receiptPromise;
assert.equal(submission.playerId, 'guest-1');
assert.equal(submission.senderId, 'guest-1');
assert.equal(receipt.submissionId, 'submission-guest');

const duplicateReceiptPromise = nextMessage(guest, message =>
  message.type === 'submission_received' && message.submissionId === 'submission-guest');
const duplicateSubmissionReachedHost = nextMessage(host, message =>
  message.type === 'submit_words' && message.submissionId === 'submission-guest', 800)
  .then(() => true, () => false);
guest.send(JSON.stringify({
  type: 'submit_words',
  submissionId: 'submission-guest',
  words: ['аист']
}));
await duplicateReceiptPromise;
assert.equal(await duplicateSubmissionReachedHost, false);

const hostReceiptPromise = nextMessage(host, message => message.type === 'submission_received');
host.send(JSON.stringify({ type: 'store_host_words', submissionId: 'submission-host', words: ['шляпа'] }));
assert.equal((await hostReceiptPromise).submissionId, 'submission-host');

const acceptedPromise = nextMessage(guest, message => message.type === 'words_accepted');
host.send(JSON.stringify({ type: 'words_accepted', playerId: 'guest-1', submitted: 2, total: 2 }));
assert.equal((await acceptedPromise).playerId, 'guest-1');

const cards = [{ id: 'card-1', word: 'аист' }, { id: 'card-2', word: 'шляпа' }];
const readyPromise = nextMessage(guest, message => message.type === 'game_ready');
host.send(JSON.stringify({
  type: 'game_ready',
  teams,
  allCards: cards,
  deck: cards,
  wordsPerPlayer: 1,
  turnSeconds: 60
}));
await readyPromise;

const snapshotPromise = nextMessage(guest, message => message.type === 'room_snapshot');
guest.send(JSON.stringify({ type: 'request_room_snapshot' }));
const snapshot = await snapshotPromise;
assert.equal(snapshot.phase, 'round_intro');
assert.equal(snapshot.game.state.allCards.length, 2);
assert.deepEqual(snapshot.submittedPlayerIds.sort(), ['guest-1', 'host-1']);

const activeState = {
  teams,
  allCards: cards,
  deck: [cards[1]],
  currentCard: cards[0],
  currentRoundIndex: 0,
  activeTeamIndex: 0,
  turnGuessedCount: 0
};
const turnPromise = nextMessage(guest, message => message.type === 'turn_started');
const turnStoredPromise = nextMessage(host, message => message.type === 'state_received');
host.send(JSON.stringify({
  type: 'turn_started',
  state: activeState,
  deadline: Date.now() + 5000,
  stateMessageId: 'state-turn-1'
}));
await turnPromise;
assert.equal((await turnStoredPromise).stateMessageId, 'state-turn-1');

const duplicateStateStoredPromise = nextMessage(host, message =>
  message.type === 'state_received' && message.stateMessageId === 'state-turn-1');
const duplicateStateReachedGuest = nextMessage(guest, message =>
  message.type === 'turn_started' && message.stateMessageId === 'state-turn-1', 800)
  .then(() => true, () => false);
host.send(JSON.stringify({
  type: 'turn_started',
  state: activeState,
  deadline: Date.now() + 5000,
  stateMessageId: 'state-turn-1'
}));
await duplicateStateStoredPromise;
assert.equal(await duplicateStateReachedGuest, false);

const actionPromise = nextMessage(host, message => message.type === 'turn_action' && message.actionId === 'action-1');
guest.send(JSON.stringify({ type: 'turn_action', action: 'guess', actionId: 'action-1' }));
assert.equal((await actionPromise).senderId, 'guest-1');

const acknowledgedState = { ...activeState, currentCard: cards[1], deck: [], turnGuessedCount: 1 };
const acknowledgedPromise = nextMessage(guest, message => message.type === 'turn_state');
host.send(JSON.stringify({
  type: 'turn_state',
  state: acknowledgedState,
  deadline: Date.now() + 5000,
  acknowledgedActionId: 'action-1'
}));
assert.equal((await acknowledgedPromise).acknowledgedActionId, 'action-1');

const duplicateSyncPromise = nextMessage(guest, message => message.type === 'game_sync');
const duplicateReachedHost = nextMessage(host, message => message.type === 'turn_action' && message.actionId === 'action-1', 800)
  .then(() => true, () => false);
guest.send(JSON.stringify({ type: 'turn_action', action: 'guess', actionId: 'action-1' }));
assert.equal((await duplicateSyncPromise).acknowledgedActionId, 'action-1');
assert.equal(await duplicateReachedHost, false);

const syncPromise = nextMessage(guest, message => message.type === 'game_sync');
guest.send(JSON.stringify({ type: 'request_turn_sync' }));
assert.equal((await syncPromise).phase, 'turn');

host.close(1000, 'Host restart test');
await wait(100);
const lateGuest = await openSocket(roomUrl(code, 'guest-2', 'Зритель', 'guest'));
const lateSnapshotPromise = nextMessage(lateGuest, message => message.type === 'room_snapshot');
lateGuest.send(JSON.stringify({ type: 'request_room_snapshot' }));
assert.equal((await lateSnapshotPromise).phase, 'turn');

host = await openSocket(roomUrl(code, 'host-1', 'Ведущий', 'host'));
const restoredHostPromise = nextMessage(host, message => message.type === 'room_snapshot');
host.send(JSON.stringify({ type: 'request_room_snapshot' }));
const restoredHost = await restoredHostPromise;
assert.equal(restoredHost.phase, 'turn');
assert.deepEqual(Object.keys(restoredHost.wordSubmissions).sort(), ['guest-1', 'host-1']);

const alarmDeadline = Date.now() + 500;
host.send(JSON.stringify({ type: 'turn_started', state: activeState, deadline: alarmDeadline }));
await wait(1400);
const alarmSyncPromise = nextMessage(guest, message => message.type === 'game_sync');
guest.send(JSON.stringify({ type: 'request_turn_sync' }));
const alarmSync = await alarmSyncPromise;
assert.equal(alarmSync.phase, 'round_intro');
assert.equal(alarmSync.state.activeTeamIndex, 1);
assert.equal(alarmSync.state.currentCard, null);
assert.equal(alarmSync.state.deck.length, 2);

const collision = await openSocket(roomUrl(code, 'host-2', 'Другой ведущий', 'host'));
const collisionError = await nextMessage(collision, message => message.type === 'room_error');
assert.equal(collisionError.error, 'room_exists');

const missing = await openSocket(roomUrl(missingCode, 'missing-guest', 'Опоздавший', 'guest'));
const missingError = await nextMessage(missing, message => message.type === 'room_error');
assert.equal(missingError.error, 'room_missing');

for (const socket of [missing, collision, lateGuest, outsider, guest, host]) {
  try { socket.close(1000, 'Test complete'); } catch (_) {}
}

console.log('Realtime smoke test passed: persistence, roster validation, retries, reconnect and server timer.');
