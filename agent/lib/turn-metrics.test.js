import assert from "node:assert/strict";
import test from "node:test";
import { reduceTurnMetrics, turnMetricsReport } from "./turn-metrics.ts";
import { chooseModelRoute, snapshotModelRoute } from "./model-routing.ts";

function event(type, data = {}, turnId = "private-turn-id") { return { type, data: { turnId, sequence: 1, ...data } }; }

test("per-turn metrics aggregate usage, latency, failures, and completion without content", () => {
  let state = reduceTurnMetrics(null, event("turn.started"), 100);
  state = reduceTurnMetrics(state, event("step.started", { stepIndex: 0 }), 110);
  const step = event("step.completed", { stepIndex: 0, usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 10, cacheWriteTokens: 0, costUsd: 0.01, privateField: "secret-token" }, providerMetadata: { secret: "secret-token" } });
  state = reduceTurnMetrics(state, step, 200);
  state = reduceTurnMetrics(state, step, 250);
  const action = event("actions.requested", { actions: [{ kind: "tool-call", callId: "c1", toolName: "read_slack", input: { secret: "private-channel-message" } }] });
  state = reduceTurnMetrics(state, action, 200);
  const failure = event("action.result", { status: "failed", error: { code: "tool_error", message: "missing_scope: private-error-details" }, result: { kind: "tool-result", callId: "c1", toolName: "read_slack", output: "private-provider-content" } });
  state = reduceTurnMetrics(state, failure, 300);
  state = reduceTurnMetrics(state, failure, 400);
  state = reduceTurnMetrics(state, event("turn.completed"), 500);
  const report = turnMetricsReport(state, "private-session-id");
  assert.equal(report.inputTokens, 100);
  assert.equal(report.outputTokens, 20);
  assert.equal(report.modelCalls, 1);
  assert.equal(report.latencyMs, 400);
  assert.equal(report.toolFailures, 1);
  assert.equal(report.tools[0].durationMs, 100);
  assert.equal(report.tools[0].failureCode, "missing_scope");
  assert.equal(report.outcome, "completed");
  assert.doesNotMatch(JSON.stringify(report), /private-|secret-token/);
  assert.doesNotMatch(JSON.stringify(state), /private-channel-message|private-provider-content|private-error-details|secret-token/);
});

test("missing usage is not reported as zero and each turn starts fresh", () => {
  let state = reduceTurnMetrics(null, event("turn.started"), 100);
  state = reduceTurnMetrics(state, event("step.completed", { stepIndex: 0, usage: { inputTokens: 10 } }), 120);
  state = reduceTurnMetrics(state, event("turn.cancelled"), 150);
  const report = turnMetricsReport(state, "s");
  assert.equal(report.outputTokens, null);
  assert.equal(report.costUsd, null);
  assert.equal(report.usageComplete, false);
  assert.equal(report.outcome, "cancelled");
  assert.equal(report.model, null);
  assert.equal(report.modelAttribution, "unknown");
  state = reduceTurnMetrics(state, event("turn.started", {}, "another-turn"), 200);
  assert.equal(state.outcome, undefined);
  assert.equal(turnMetricsReport(state, "s").modelCalls, 0);
  state = reduceTurnMetrics(state, event("turn.failed", { code: "untrusted-secret", message: "secret-token" }, "another-turn"), 250);
  assert.equal(turnMetricsReport(state, "s").failureCode, "runtime_error");
});

test("model attribution follows a safe turn decision and never assumes a served model", () => {
  const route = { ...snapshotModelRoute(chooseModelRoute("deep: Plan the event")), request: "private-secret", credentials: "secret-token" };
  let state = reduceTurnMetrics(null, event("turn.started"), 100);
  state = reduceTurnMetrics(state, event("step.started", { stepIndex: 0 }), 120, route);
  state = reduceTurnMetrics(state, event("step.completed", { stepIndex: 0, usage: { inputTokens: 12, outputTokens: 4 } }), 150, route);
  const report = turnMetricsReport(state, "s");
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.model, "openai/gpt-5.6-sol");
  assert.equal(report.modelAttribution, "selected");
  assert.equal(report.routing.reason, "explicit_deep");
  assert.equal(report.routing.reasoningEffort, "low");
  assert.equal(report.costUsd, null);
  assert.doesNotMatch(JSON.stringify(report), /private-secret|secret-token/);
  state = reduceTurnMetrics(state, event("turn.started", {}, "next-turn"), 200);
  assert.equal(turnMetricsReport(state, "s").model, null);
});
