import assert from "node:assert/strict";
import test from "node:test";
import { reduceAgentTraces, traceEntries, traceViewerUrl, MAX_TRACE_ENTRIES, MAX_TRACE_TURNS } from "./agent-trace.ts";
import { agentTraces, inspectAgentRun } from "./trace-state.ts";

const event = (type, data = {}, sequence = 0) => ({ type, data: { turnId: "t1", sequence, ...data }, meta: { at: "2026-09-29T12:00:00Z" } });

test("trace captures service operations, waits and failures without any source payload", () => {
  let state = [];
  const events = [
    event("turn.started"),
    event("message.received", { message: "private secret" }, 1),
    event("reasoning.appended", { reasoningDelta: "private secret" }, 2),
    event("actions.requested", { actions: [{ kind: "tool-call", callId: "secret-call-id", toolName: "read_team_data", input: { service: "notion", tool: "notion-fetch", arguments: { id: "private secret" } } }] }, 3),
    event("authorization.required", { authorization: { url: "https://secret.example/token" } }, 4),
    event("action.result", { status: "failed", error: { code: "tool_error", message: "missing_scope: private secret" }, result: { kind: "tool-result", callId: "secret-call-id", toolName: "read_team_data", output: "private secret" } }, 5),
    event("turn.failed", { code: "secret", message: "secret" }, 6),
  ];
  for (const item of events) state = reduceAgentTraces(state, item, "secret-session", 0);
  assert.equal(state[0].entries.length, 5);
  assert.equal(state[0].entries[1].operation, "notion-fetch");
  assert.equal(state[0].entries[2].status, "waiting_for_authorization");
  assert.equal(state[0].entries[3].failure, "missing_scope");
  assert.equal(state[0].outcome, "failed");
  assert.doesNotMatch(JSON.stringify(state), /private|secret/);
  assert.equal(traceEntries(event("step.completed", { usage: { inputTokens: 10, outputTokens: 3, costUsd: 0.001, hidden: "secret" } }), 0)[0].costUsd, 0.001);
});

test("trace replay is idempotent and storage remains bounded with terminal outcome", () => {
  let state = reduceAgentTraces([], event("turn.started"), "s", 0);
  state = reduceAgentTraces(state, event("turn.started"), "s", 20);
  assert.equal(state[0].entries.length, 1);
  for (let i = 1; i < MAX_TRACE_ENTRIES + 3; i++) state = reduceAgentTraces(state, event("step.started", { stepIndex: i }, i), "s", 0);
  state = reduceAgentTraces(state, event("turn.completed", {}, 500), "s", 0);
  assert.equal(state[0].entries.length, MAX_TRACE_ENTRIES);
  assert.equal(state[0].truncated, true);
  assert.equal(state[0].outcome, "completed");
  for (let i = 2; i < 20; i++) state = reduceAgentTraces(state, event("turn.started", { turnId: `t${i}` }), "s", 0);
  assert.equal(state.length, MAX_TRACE_TURNS);
});

test("Eve's constant per-turn sequence preserves every distinct model step", () => {
  let state = [];
  for (let stepIndex = 0; stepIndex < 3; stepIndex++) {
    for (const type of ["step.started", "step.completed"]) state = reduceAgentTraces(state, event(type, { stepIndex }, 0), "s", 0);
  }
  assert.equal(state[0].entries.length, 6);
  state = reduceAgentTraces(state, event("step.completed", { stepIndex: 2 }, 0), "s", 0);
  assert.equal(state[0].entries.length, 6);
});

test("trace never echoes unknown tool names or arbitrary dashboard destinations", () => {
  const entries = traceEntries(event("actions.requested", { actions: [{ kind: "tool-call", callId: "c", toolName: "private-content", input: {} }] }), 0);
  assert.equal(entries[0].tool, "other");
  assert.equal(traceViewerUrl("https://vercel.com/team/project/observability/agent-runs"), "https://vercel.com/team/project/observability/agent-runs");
  for (const url of ["http://vercel.com/team/project/observability/agent-runs", "https://vercel.com.evil.test/", "https://user:secret@vercel.com/team/project/observability/agent-runs", "https://vercel.com/team/project/observability/agent-runs?token=secret"]) assert.equal(traceViewerUrl(url), null);
});

test("trace lookup enforces the verified requester and reads only current session state", (t) => {
  const before = process.env.VEE_SLACK_ROLLOUT;
  process.env.VEE_SLACK_ROLLOUT = "enabled";
  t.after(() => before === undefined ? delete process.env.VEE_SLACK_ROLLOUT : process.env.VEE_SLACK_ROLLOUT = before);
  t.mock.method(agentTraces, "get", () => [{ turnKey: "a".repeat(24), entries: [] }]);
  const current = { authenticator: "slack-webhook", principalType: "user", principalId: "slack:T02UZ8D4ZMY:UA", issuer: "slack:T02UZ8D4ZMY", attributes: { team_id: "T02UZ8D4ZMY", user_id: "UA", channel_id: "CA" } };
  const ctx = { session: { auth: { current, initiator: current } } };
  assert.equal(inspectAgentRun(ctx).traces.length, 1);
  assert.equal(inspectAgentRun(ctx, "b".repeat(24)).traces.length, 0);
  assert.throws(() => inspectAgentRun({ session: { auth: {} } }), { code: "access_denied" });
});
