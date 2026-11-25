import assert from "node:assert/strict";
import test from "node:test";
import { mapGmailMessageToEmail } from "./emailPresentation.ts";

const message = {
  id: "gmail-analysis", thread_id: "thread",
  sender: "Alex <alex@example.org>", recipient: "team@example.org",
  subject: "URGENT", date: "Tue, 24 Nov 2026 09:00:00 -0800",
  snippet: "Please verify your password.", body: "Please verify your password.",
  classification: "Potential threat", confidence: 88,
};

test("observed evidence and recommendations map into Gmail email cards", () => {
  const analysis = {
    indicators: [{ code: "sensitive-information-request", category: "language", severity: "elevated", title: "Sensitive information requested", description: "Password requested", evidence: "Please verify your password", recommendation: "Verify independently" }],
    recommendations: ["Verify independently"],
    note: "Rules are not model reasoning",
  };
  const email = mapGmailMessageToEmail({ ...message, security_analysis: analysis, reply_to: "alex@example.net" });
  assert.deepEqual(email.securityAnalysis, analysis);
  assert.equal(email.classification, "Potential threat");
  assert.equal(email.confidence, 88);
});

test("an older Gmail backend without optional field remains usable", () => {
  const email = mapGmailMessageToEmail(message);
  assert.equal(email.securityAnalysis, undefined);
});
