import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAgentMailArguments } from "./agentmail-sanitize.ts";

test("strips empty strings, null, and empty arrays", () => {
  assert.deepEqual(
    sanitizeAgentMailArguments({
      inboxId: "vee-umich@agentmail.to",
      before: "",
      after: null,
      labels: [],
      pageToken: undefined,
    }),
    { inboxId: "vee-umich@agentmail.to" },
  );
});

test("preserves meaningful falsy values", () => {
  assert.deepEqual(
    sanitizeAgentMailArguments({
      inboxId: "in_123",
      ascending: false,
      includeSpam: false,
      limit: 0,
    }),
    { inboxId: "in_123", ascending: false, includeSpam: false, limit: 0 },
  );
});

test("keeps non-empty filters intact", () => {
  assert.deepEqual(
    sanitizeAgentMailArguments({
      inboxId: "in_123",
      before: "2026-01-31T00:00:00Z",
      from: ["a@b.co"],
      q: "standup notes",
    }),
    {
      inboxId: "in_123",
      before: "2026-01-31T00:00:00Z",
      from: ["a@b.co"],
      q: "standup notes",
    },
  );
});

test("drops array entries that are empty and arrays left empty", () => {
  assert.deepEqual(
    sanitizeAgentMailArguments({ to: ["", "c@d.co"], subject: [""] }),
    { to: ["c@d.co"] },
  );
});

test("recursively sanitizes nested objects and drops emptied ones", () => {
  assert.deepEqual(
    sanitizeAgentMailArguments({
      inboxId: "in_123",
      filter: { subject: "", labels: [] },
      meta: { keep: "x" },
    }),
    { inboxId: "in_123", meta: { keep: "x" } },
  );
});

test("returns an empty object when everything is stripped", () => {
  assert.deepEqual(sanitizeAgentMailArguments({ a: "", b: [], c: null }), {});
});
