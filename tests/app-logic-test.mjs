import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const parserStart = appSource.indexOf('function extractRoomCodeFromLocation');
const parserEnd = appSource.indexOf('\nfunction checkUrlRoomCode', parserStart);
assert.ok(parserStart >= 0 && parserEnd > parserStart, 'Room-code parser must exist');

const parserSource = appSource.slice(parserStart, parserEnd);
const extractRoomCodeFromLocation = Function(
  `${parserSource}; return extractRoomCodeFromLocation;`
)();

assert.equal(extractRoomCodeFromLocation('#room=7698', ''), '7698');
assert.equal(
  extractRoomCodeFromLocation('', '?vk_user_id=123456789&vk_app_id=987654&vk_start_param=room_7698'),
  '7698'
);
assert.equal(
  extractRoomCodeFromLocation('', '?tgWebAppData=user%3D123456789&tgWebAppStartParam=room_7698'),
  '7698'
);
assert.equal(extractRoomCodeFromLocation('', '?vk_user_id=123456789&vk_app_id=987654'), null);

console.log('App logic test passed: VK, Telegram and hash room links use the explicit room code.');
