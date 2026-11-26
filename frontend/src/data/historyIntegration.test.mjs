import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const api = readFileSync(new URL("../api.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../components/SettingsPage.tsx", import.meta.url), "utf8");
const privacy = readFileSync(new URL("../components/HistoryDataSettings.tsx", import.meta.url), "utf8");
const history = readFileSync(new URL("../components/LabHistoryPage.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");

test("lab history navigation and resuming are connected", () => {
  assert.match(sidebar, /onNavigate\("history"\)/);
  assert.match(app, /activePage === "history"/);
  assert.match(app, /<LabHistoryPage/);
  assert.match(history, /getLabSessions\(/);
  for (const apiFunction of ["getHistoryStatus", "getHistoryScans", "saveScanFeedback", "deleteHistoryScan", "clearScanHistory"]) {
    assert.match(api, new RegExp(`export async function ${apiFunction}`));
  }
});

test("history privacy controls explicitly opt in and allow export and deletion", () => {
  assert.match(settings, /<HistoryDataSettings/);
  assert.match(privacy, /Save Lab history/);
  assert.match(privacy, /updateHistorySettings\(/);
  assert.match(privacy, /exportScanHistory\(/);
  assert.match(privacy, /clearScanHistory\(/);
  assert.match(privacy, /window.confirm/);
  assert.match(privacy, /retention/);
});
