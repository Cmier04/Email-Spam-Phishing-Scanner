import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const panel = readFileSync(new URL('../components/WhatIfPanel.tsx', import.meta.url), 'utf8');
const lab = readFileSync(new URL('../components/LearningLab.tsx', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../components/DebuggingSettings.tsx', import.meta.url), 'utf8');
const preference = readFileSync(new URL('./forceQwenPreference.ts', import.meta.url), 'utf8');

 test('Force Qwen checkbox and local status belong to Settings Debugging, not Learning Lab', () => {
  assert.match(settings, /Force Qwen \(no fixed-text fallback\)/);
  assert.match(settings, /getLocalAIStatus/);
  assert.match(settings, /saveForceQwenPreference/);
  assert.doesNotMatch(panel, /Force Qwen \(no fixed-text fallback\)/);
  assert.doesNotMatch(panel, /<h3[^>]*>Debugging<\/h3>/);
  assert.doesNotMatch(panel, /getLocalAIStatus/);
  assert.match(panel, /Generation details/);
});

test('Settings preference persists and Learning Lab invalidates old comparisons when changed', () => {
  assert.match(preference, /phislab_debug_force_qwen/);
  assert.match(preference, /localStorage\.setItem/);
  assert.match(preference, /FORCE_QWEN_CHANGED_EVENT/);
  assert.match(lab, /readForceQwenPreference/);
  assert.match(lab, /scoreRequests\.current\.forEach/);
  assert.match(lab, /window\.addEventListener\(FORCE_QWEN_CHANGED_EVENT, synchronize\)/);
  assert.match(lab, /ai_mode: forceQwen \? "require_qwen" : "automatic"/);
});
