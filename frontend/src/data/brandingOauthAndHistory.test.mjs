import { readFileSync, statSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const file = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('branding uses PhishLab and includes real desktop icon files', () => {
  const desktop = JSON.parse(file('../../../package.json'));
  assert.equal(desktop.build.productName, 'PhishLab');
  assert.match(file('../../index.html'), /<title>PhishLab/);
  for (const name of ['icon.png', 'icon.icns', 'icon.ico']) {
    assert.ok(statSync(new URL('../../../desktop/assets/' + name, import.meta.url)).size > 1000);
  }
});

test('Settings lets users provide a Desktop OAuth client without a terminal', () => {
  assert.match(file('../components/SettingsPage.tsx'), /Import Desktop OAuth JSON/);
  assert.match(file('../components/SettingsPage.tsx'), /handleOauthClientFile/);
  assert.match(file('../api.ts'), /\/api\/gmail\/oauth-client/);
  assert.match(file('../components/SettingsPage.tsx'), /google-auth-oauthlib/);
});

test('Lab History has subtitle and a staggered top-to-bottom entrance', () => {
  const page = file('../components/LabHistoryPage.tsx');
  const animation = file('../animations.css');
  assert.match(page, /Revisit your learning results/);
  assert.match(page, /phishlab-history-stagger/);
  assert.match(page, /phishlab-history-list/);
  assert.match(animation, /phishlab-history-list > :nth-child/);
  assert.match(animation, /prefers-reduced-motion: reduce/);
});
