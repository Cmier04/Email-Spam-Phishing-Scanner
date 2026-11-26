import assert from "node:assert/strict";
import test from "node:test";
import { greetingName } from "./accountGreeting.ts";

test("dashboard welcomes connected users by first name only", () => {
  assert.equal(greetingName("Alex Morgan", "alex.morgan@example.com"), "Alex");
  assert.equal(greetingName("  Charlee Thou  ", "charlee@example.com"), "Charlee");
  assert.equal(greetingName(null, "alex.morgan@example.com"), "alex");
  assert.equal(greetingName(undefined, undefined), "there");
});
