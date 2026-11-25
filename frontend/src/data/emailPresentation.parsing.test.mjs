import assert from "node:assert/strict";
import test from "node:test";
import { mapGmailMessageToEmail } from "./emailPresentation.ts";
import { getOriginalPartValue } from "./labTransformations.ts";

const base = {
  id: "gmail-1", thread_id: "thread-1",
  sender: '"Support Team" <support@example.org>',
  recipient: "user@example.org", subject: "Appointment confirmation",
  date: "Tue, 24 Nov 2026 09:00:00 -0800",
  snippet: "Your appointment is tomorrow.", body: "Hello Taylor,\nPlease confirm your appointment.\nThanks,\nSupport Team",
  classification: "Legitimate", confidence: 98,
};

test("the real parsed Gmail fields appear in Learning Lab components", () => {
  const email = mapGmailMessageToEmail({
    ...base,
    sender_name: "Support Team",
    sender_address: "support@example.org",
    greeting: "Hello Taylor,",
    request: "Please confirm your appointment.",
    link_text: "Review booking",
    links: [{ display_text: "Review booking", url: "https://example.org/booking" }],
    attachment: "appointment.ics",
    attachments: [{ filename: "appointment.ics", mime_type: "text/calendar", size: 123 }],
    signature: "Support Team",
  });
  assert.equal(getOriginalPartValue(email, "greeting"), "Hello Taylor,");
  assert.equal(getOriginalPartValue(email, "request"), "Please confirm your appointment.");
  assert.equal(getOriginalPartValue(email, "link"), "Review booking");
  assert.equal(getOriginalPartValue(email, "attachment"), "appointment.ics");
  assert.equal(getOriginalPartValue(email, "signature"), "Support Team");
  assert.deepEqual(email.links, [
    { display_text: "Review booking", url: "https://example.org/booking" }
  ]);
});

test("missing Gmail components stay empty; greeting is never invented", () => {
  const email = mapGmailMessageToEmail(base);
  assert.equal(getOriginalPartValue(email, "greeting"), "");
  assert.equal(getOriginalPartValue(email, "request"), "");
  assert.equal(getOriginalPartValue(email, "attachment"), "");
  assert.equal(getOriginalPartValue(email, "signature"), "");
  assert.equal(email.sender, "Support Team");
});
