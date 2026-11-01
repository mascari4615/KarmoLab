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

test('미리 알림은 0~60분, 기본 10분', () => {
  const s = new Settings();
  assert.equal(s.get('notifyLeadMin'), 10);
  assert.deepEqual(s.put({ notifyLeadMin: 30 }, { quiet: true }), []);
  assert.equal(s.get('notifyLeadMin'), 30);
  assert.equal(s.put({ notifyLeadMin: 99 }, { quiet: true }).length, 1);
  assert.equal(s.get('notifyLeadMin'), 60);
});
