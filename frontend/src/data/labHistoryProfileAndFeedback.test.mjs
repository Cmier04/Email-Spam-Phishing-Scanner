import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
const file = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("connected Google identity replaces hard-coded sidebar prototype", () => {
  const sidebar=file("../components/Sidebar.tsx");
  const app=file("../App.tsx");
  assert.doesNotMatch(sidebar, /John Doe|Prototype profile/);
  assert.match(sidebar, /accountName/);
  assert.match(sidebar, /\/api\/gmail\/avatar/);
  assert.match(app, /gmailStatus\.display_name/);
});

test("Lab History saves changes and opens original educational snapshot for editing", () => {
  assert.match(file("../components/LabHistoryPage.tsx"), /getLabSession\(/);
  assert.match(file("../components/LabHistoryPage.tsx"), /Continue lab/);
  assert.match(file("../components/LearningLab.tsx"), /initialSession\?\.experiment/);
  assert.match(file("../components/LearningLab.tsx"), /saveLabSession\(/);
  assert.match(file("../components/HistoryDataSettings.tsx"), /Save Lab history/);
});

test("classification feedback is a blue accessible blurred modal", () => {
  const detail=file("../components/EmailDetail.tsx");
  const popup=file("../components/ClassificationFeedbackDialog.tsx");
  assert.match(detail, /bg-\[#3157d5\].*Report incorrect classification/s);
  assert.match(popup, /role="dialog" aria-modal="true"/);
  assert.match(popup, /backdrop-blur/);
  for (const verdict of ["incorrect", "correct", "unsure"]) assert.match(popup, new RegExp(verdict));
  assert.match(popup, /saveEmailFeedback\(/);
});
