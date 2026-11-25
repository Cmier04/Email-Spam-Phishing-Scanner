import assert from "node:assert/strict";
import test from "node:test";
import { getLabOptions, buildWhatIfRequest } from "./labTransformations.ts";

const email = { id: "demo-001", subject: "URGENT: Verify now", body: "Please reply now." };

test("neutral subject and body transformations advertise optional local Qwen", () => {
  for (const part of ["subject", "body", "request"]) {
    const options = getLabOptions(part, email);
    const rewrite = options.find((option) => ["subject-wording", "body-rephrase", "request-rephrase"].includes(option.id));
    assert.ok(rewrite, `${part} rewrite option must exist`);
    assert.match(rewrite.description, /local Qwen/i);
    assert.equal(rewrite.scope, "Message text");
  }
});

test("backend retains the original What-If request contract", () => {
  const request = buildWhatIfRequest(email.id, [getLabOptions("subject", email)[1]]);
  assert.equal(request.email_id, "demo-001");
  assert.deepEqual(request.transformations, [{part: "subject", transformation_id: "subject-wording"}]);
});
