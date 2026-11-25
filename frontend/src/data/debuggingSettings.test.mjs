import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../components/DebuggingSettings.tsx', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../components/SettingsPage.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api.ts', import.meta.url), 'utf8');

test('Settings includes a Debugging section with device defaults and manual override', () => {
  assert.match(settings, /<DebuggingSettings\s*\/>/);
  assert.match(page, /Detected device/);
  assert.match(page, /Auto detect/);
  assert.match(page, /Manual override/);
  assert.match(page, /Save manual settings/);
  assert.match(api, /\/api\/debug\/ai-settings/);
});

test('local Python runner has test selection, run button and output in settings', () => {
  assert.match(page, /Available test files and functions/);
  assert.match(page, /Run selected test/);
  assert.match(page, /result\.output/);
  assert.match(page, /getPythonTests/);
  assert.match(api, /X-PhishLab-Local-Tests/);
});
