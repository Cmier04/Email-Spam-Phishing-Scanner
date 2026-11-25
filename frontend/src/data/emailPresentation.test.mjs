import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEmailStats,
  emailsForMode,
  loadConnectedGmailEmails,
  mapGmailMessageToEmail,
} from "./emailPresentation.ts";

const connected = {
  state: "connected",
  connected: true,
  email: "owner@example.test",
  error: null,
  credentials_configured: true,
};

const rawGmailMessage = {
  id: "gmail-message-id",
  thread_id: "gmail-thread-id",
  sender: 'Security Team <security@example.test>',
  recipient: "learner@example.test",
  subject: "Account update",
  date: "Tue, 24 Nov 2026 10:30:00 -0800",
  snippet: "A short inbox summary",
  body: "Full original body ".repeat(100),
  classification: "Potential threat",
  confidence: 94.5,
};

test("a connected Gmail scan returns live results", async () => {
  const email = mapGmailMessageToEmail(rawGmailMessage);
  const result = await loadConnectedGmailEmails(
    async () => connected,
    async () => [email]
  );

  assert.deepEqual(result, [email]);
});

test("a disconnected Gmail scan stops before requesting messages", async () => {
  let requestedMessages = false;
  await assert.rejects(
    loadConnectedGmailEmails(
      async () => ({ ...connected, state: "disconnected", connected: false }),
      async () => {
        requestedMessages = true;
        return [];
      }
    ),
    /Connect an account from Settings/
  );
  assert.equal(requestedMessages, false);
});

test("Gmail request failures remain failures and empty inboxes remain empty", async () => {
  await assert.rejects(
    loadConnectedGmailEmails(
      async () => connected,
      async () => { throw new Error("Gmail unavailable"); }
    ),
    /Gmail unavailable/
  );

  assert.deepEqual(
    await loadConnectedGmailEmails(async () => connected, async () => []),
    []
  );
});

test("real Gmail messages preserve IDs and full bodies but bound list previews", () => {
  const email = mapGmailMessageToEmail(rawGmailMessage);

  assert.equal(email.id, "gmail-message-id");
  assert.equal(email.source, "gmail");
  assert.equal(email.sender, "Security Team");
  assert.equal(email.email, "security@example.test");
  assert.equal(email.subject, "Account update");
  assert.equal(email.body, rawGmailMessage.body);
  assert.ok(email.preview.length <= 180);
  assert.equal(email.classification, "Potential threat");
  assert.equal(email.confidence, 94.5);
});

test("dashboard statistics are calculated from the active result set", () => {
  const threat = mapGmailMessageToEmail(rawGmailMessage);
  const legitimate = {
    ...threat,
    id: "legitimate-id",
    classification: "Legitimate",
    confidence: 85.5,
  };

  assert.deepEqual(calculateEmailStats([threat, legitimate]), {
    total: 2,
    legitimate: 1,
    threats: 1,
    meanConfidence: 90,
  });
});

test("mode switching selects one source without mixing Gmail and demo emails", () => {
  const gmail = [{ id: "gmail-id" }];
  const demo = [{ id: "demo-id" }];

  assert.equal(emailsForMode("gmail", demo, gmail), gmail);
  assert.equal(emailsForMode("demo", demo, gmail), demo);
});
