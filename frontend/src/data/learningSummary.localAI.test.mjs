import assert from "node:assert/strict";
import test from "node:test";
import { buildLearningSummary } from "./learningSummary.ts";

const changes = [
  { id: "subject-format", part: "subject", title: "Normalize capitalization", kind: "Meaning-preserving", scope: "Message text" },
];
const apiResponse = {
  email_id: "demo-001", source: "demo", original_classification: "Potential threat", modified_classification: "Potential threat",
  original_confidence: 90, modified_confidence: 80, original_malicious_probability: 90, modified_malicious_probability: 80,
  score_change: -10, decision_changed: false, applied_transformations: [
    { part: "subject", transformation_id: "subject-format", applied: true, affects_classifier: true, message: "Subject capitalization was normalized." },
  ],
  modified_subject: "example", modified_body: "example", modified_values: {}, warnings: [],
};

test("identifies locally generated AI guidance without modifying score", () => {
  const summary = buildLearningSummary(changes, {
    ...apiResponse,
    learning_summary: {
      source: "local_ai", fallback_reason: null,
      changes_made: ["Subject capitalization was normalized."],
      why_it_mattered: "Measured values are accurate. Comparing the message teaches careful evaluation.",
      what_you_should_learn: "Check requests through a trusted source.",
    },
  });
  assert.match(summary.note, /Offline AI/);
  assert.equal(summary.originalProbability, "90.00%");
  assert.equal(summary.modifiedProbability, "80.00%");
  assert.match(summary.whyItMattered, /Comparing the message/);
});

test("shows fallback explanation when AI model is unavailable", () => {
  const summary = buildLearningSummary(changes, {
    ...apiResponse,
    learning_summary: {
      source: "dynamic", fallback_reason: "generation_timeout",
      changes_made: ["Subject capitalization was normalized."],
      why_it_mattered: "Measured values are accurate.",
      what_you_should_learn: "Verify unexpected requests independently.",
    },
  });
  assert.match(summary.note, /fallback used/);
  assert.equal(summary.whyItMattered, "Measured values are accurate.");
});
