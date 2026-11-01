import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Settings } from '../dist/settings.js';

test('화면 보기, 소리 내기, 먼저 말 걸기는 따로 꺼진다', () => {
  const s = new Settings();
  assert.equal(s.on('screenLook'), true);
  assert.equal(s.on('voiceOut'), true);
  assert.deepEqual(s.put({ voiceOut: false }, { quiet: true }), []);
  assert.equal(s.on('voiceOut'), false);
  assert.equal(s.on('screenLook'), true);
  assert.equal(s.on('speakFirst'), true);
});
