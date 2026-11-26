import assert from "node:assert/strict";
import test from "node:test";
import { getLabOptions, getSavedLabOption, buildWhatIfRequest } from "./labTransformations.ts";

const email = {
  id: "demo-001", subject: "Account notice", sender: "Example Account Team",
  email: "team@example.com", greeting: "Hello there,", body: "Hello there,\nPlease review your account.",
  request: "Please review your account.", link_text: "View details", attachment: "notice.pdf", signature: "Support",
};

const parts = ["senderName", "senderAddress", "subject", "greeting", "body", "request", "link", "attachment", "signature", "formatting"];

test("every component offers exactly three directions with unique IDs", () => {
  const allIds = new Set();
  for (const part of parts) {
    const options = getLabOptions(part, email);
    assert.equal(options.length, 3, part);
    assert.deepEqual(options.map(option => option.direction), ["More suspicious", "Neutral", "Less suspicious"]);
    for (const option of options) {
      assert.equal(option.part, part);
      assert.ok(!allIds.has(option.id), option.id);
      allIds.add(option.id);
    }
  }
  assert.equal(allIds.size, 30);
});

test("preview-only metadata still uses the existing API request shape", () => {
  const choice = getLabOptions("attachment", email)[0];
  assert.equal(choice.scope, "Metadata only");
  assert.deepEqual(buildWhatIfRequest(email.id, [choice]), {
    email_id: "demo-001", transformations: [{ part: "attachment", transformation_id: "attachment-urgent" }],
  });
});

test("previously saved capitalization edits remain resumable without a fourth choice", () => {
  const old = getSavedLabOption("subject", "subject-format", email);
  assert.equal(old?.id, "subject-format");
  assert.equal(getLabOptions("subject", email).length, 3);
});
