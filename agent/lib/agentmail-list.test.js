import assert from "node:assert/strict";
import test from "node:test";
import {
  agentMailInboxListArguments,
  normalizeAgentMailInboxList,
} from "./agentmail-list.ts";

const inboxes = {
  count: 1,
  limit: 10,
  inboxes: [
    {
      inboxId: "vee@agentmail.to",
      email: "vee@agentmail.to",
      updatedAt: "2026-08-23T00:00:00Z",
      createdAt: "2026-08-23T00:00:00Z",
    },
  ],
};

test("always sends the safe first-page arguments", () => {
  const args = agentMailInboxListArguments();

  assert.deepEqual(args, { limit: 10 });
  assert.equal("pageToken" in args, false);
});

test("returns structured inbox data", () => {
  assert.deepEqual(
    normalizeAgentMailInboxList({ content: [], structuredContent: inboxes }),
    inboxes,
  );
});

test("parses inbox data from text content", () => {
  assert.deepEqual(
    normalizeAgentMailInboxList({
      content: [{ type: "text", text: JSON.stringify(inboxes) }],
    }),
    inboxes,
  );
});

test("surfaces AgentMail tool errors", () => {
  assert.throws(
    () =>
      normalizeAgentMailInboxList({
        content: [{ type: "text", text: "Request validation failed" }],
        isError: true,
      }),
    /Request validation failed/,
  );
});
