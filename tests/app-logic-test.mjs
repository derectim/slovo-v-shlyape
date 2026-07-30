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

const inviteStart = appSource.indexOf('function createRoomInvite');
const inviteEnd = appSource.indexOf('\nasync function shareRoomLink', inviteStart);
assert.ok(inviteStart >= 0 && inviteEnd > inviteStart, 'Invite builder must exist');
const createRoomInvite = Function(
  `${appSource.slice(inviteStart, inviteEnd)}; return createRoomInvite;`
)();

const telegramInvite = createRoomInvite('6980', 'telegram');
assert.equal(
  telegramInvite.primaryUrl,
  'https://t.me/slovo_v_shlyape_game_bot/game?startapp=room_6980'
);
assert.match(telegramInvite.text, /https:\/\/vk\.ru\/app54699959#room_6980/);
assert.match(telegramInvite.text, /https:\/\/derectim\.github\.io\/slovo-v-shlyape\/#room=6980/);
assert.ok(
  telegramInvite.text.indexOf('✈️ Telegram') < telegramInvite.text.indexOf('💙 VK'),
  'Telegram link should be first inside Telegram'
);

const vkInvite = createRoomInvite('6980', 'vk');
assert.equal(vkInvite.primaryUrl, 'https://vk.ru/app54699959#room_6980');
assert.ok(
  vkInvite.text.indexOf('💙 VK') < vkInvite.text.indexOf('✈️ Telegram'),
  'VK link should be first inside VK'
);

const copyStart = appSource.indexOf('async function copyTextToClipboard');
const copyEnd = appSource.indexOf('\nfunction extractRoomCodeFromLocation', copyStart);
assert.ok(copyStart >= 0 && copyEnd > copyStart, 'Clipboard helper must exist');

const copySource = appSource.slice(copyStart, copyEnd);
const createCopyHelper = Function(
  'window',
  'navigator',
  'document',
  'isVkMiniApp',
  `${copySource}; return copyTextToClipboard;`
);

let vkCopiedText = null;
const vkCopy = createCopyHelper({
  vkBridge: {
    isEmbedded: () => true,
    supports: command => command === 'VKWebAppCopyText',
    send: async (command, payload) => {
      assert.equal(command, 'VKWebAppCopyText');
      vkCopiedText = payload.text;
      return { result: true };
    }
  },
  isSecureContext: true
}, {
  clipboard: { writeText: async () => assert.fail('Browser clipboard should not run after VK success') }
}, {}, true);
assert.equal(await vkCopy('приглашение VK'), true);
assert.equal(vkCopiedText, 'приглашение VK');

let browserCopiedText = null;
const browserCopy = createCopyHelper({ isSecureContext: true }, {
  clipboard: { writeText: async text => { browserCopiedText = text; } }
}, {}, false);
assert.equal(await browserCopy('приглашение Web'), true);
assert.equal(browserCopiedText, 'приглашение Web');

const textarea = {
  value: '',
  style: {},
  setAttribute() {},
  focus() {},
  select() {},
  setSelectionRange() {}
};
let fallbackInvoked = false;
const fallbackCopy = createCopyHelper({ isSecureContext: true }, {
  clipboard: { writeText: async () => { throw new Error('Clipboard denied'); } }
}, {
  createElement: () => textarea,
  body: { appendChild() {}, removeChild() {} },
  execCommand: command => {
    fallbackInvoked = command === 'copy';
    return true;
  }
}, false);
assert.equal(await fallbackCopy('резервное приглашение'), true);
assert.equal(fallbackInvoked, true);
assert.equal(textarea.value, 'резервное приглашение');

console.log('App logic test passed: platform invites, room links and clipboard fallbacks work.');
