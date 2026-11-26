import assert from "node:assert/strict";
import test from "node:test";
import { buildLearningSummary } from "./learningSummary.ts";

const chosen = {
  id: "subject-format", part: "subject", title: "Normalize capitalization",
  description: "Test capitalization", value: "notice",
  kind: "Meaning-preserving", scope: "Message text",
};
const baseResult = {
  email_id: "demo-001", source: "demo",
  original_classification: "Potential threat", modified_classification: "Legitimate",
  original_confidence: 90, modified_confidence: 90,
  original_malicious_probability: 90, modified_malicious_probability: 10,
  score_change: -80, decision_changed: true,
  applied_transformations: [{part: "subject", transformation_id: "subject-format", applied: true, affects_classifier: true, message: "Subject capitalization was normalized."}],
  modified_subject: "notice", modified_body: "example", modified_values: {}, warnings: [],
};

test("uses backend generated evidence-based text, preserving measured numbers", () => {
  const summary = buildLearningSummary([chosen], {
    ...baseResult,
    learning_summary: {
      source: "dynamic",
      changes_made: ["Subject capitalization was normalized."],
      why_it_mattered: "The classifier's estimated malicious probability decreased by 80.00 percentage points.",
      what_you_should_learn: "Verify unexpected account requests independently.",
    },
  });
  assert.match(summary.note, /Learning guidance based on your comparison/);
  assert.equal(summary.isBackendExplanation, true);
  assert.equal(summary.whyItMattered, "The classifier's estimated malicious probability decreased by 80.00 percentage points.");
  assert.equal(summary.probabilityDifference, "−80.00 percentage points");
});

test("older backend or skipped summary still receives compatible frontend guidance", () => {
  for (const learning_summary of [undefined, null]) {
    const summary = buildLearningSummary([chosen], {...baseResult, learning_summary});
    assert.equal(summary.isBackendExplanation, false);
    assert.ok(summary.whyItMattered.length > 30);
    assert.match(summary.note, /Learning guidance based on your comparison/);
  }
});
