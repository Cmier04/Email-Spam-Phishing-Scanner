import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORCE_QWEN_CHANGED_EVENT,
  FORCE_QWEN_STORAGE_KEY,
  readForceQwenPreference,
  saveForceQwenPreference,
} from './forceQwenPreference.ts';

test('Force Qwen preference persists and notifies listeners', () => {
  const previousWindow = globalThis.window;
  const storage = new Map();
  const events = [];
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    dispatchEvent: (event) => { events.push(event.type); return true; },
  };
  try {
    assert.equal(readForceQwenPreference(), false);
    saveForceQwenPreference(true);
    assert.equal(storage.get(FORCE_QWEN_STORAGE_KEY), '1');
    assert.equal(readForceQwenPreference(), true);
    saveForceQwenPreference(false);
    assert.equal(readForceQwenPreference(), false);
    assert.deepEqual(events, [FORCE_QWEN_CHANGED_EVENT, FORCE_QWEN_CHANGED_EVENT]);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('preference stays usable if browser storage is unavailable', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: {getItem: () => {throw Error('blocked');},setItem: () => {throw Error('blocked');}}, dispatchEvent: () => true };
  try {
    saveForceQwenPreference(true);
    assert.equal(readForceQwenPreference(), true);
    saveForceQwenPreference(false);
    assert.equal(readForceQwenPreference(), false);
  } finally {
    globalThis.window = previousWindow;
  }
});
