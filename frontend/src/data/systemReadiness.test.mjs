import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const api = readFileSync(new URL("../api.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL("../components/DebuggingSettings.tsx", import.meta.url), "utf8");

test("readiness API validates status and all boolean availability flags", () => {
  assert.match(api, /export async function getSystemReadiness/);
  for (const field of ["classifier_ready", "qwen_enabled", "qwen_model_available", "gmail_credentials_configured"]) {
    assert.match(api, new RegExp(`typeof value\.${field} !== \"boolean\"`));
  }
});

test("Settings exposes readiness and errors without moving Force Qwen back to Learning Lab", () => {
  assert.match(settings, /Application readiness/);
  assert.match(settings, /getSystemReadiness\(controller.signal\)/);
  assert.match(settings, /readinessError/);
  assert.match(settings, /Force Qwen \(no fixed-text fallback\)/);
});
