import assert from "node:assert/strict";
import test from "node:test";
import { chooseModelRoute, modelSelection, safeModelRoute, safeRoutingDecision, snapshotModelRoute } from "./model-routing.ts";

test("routine V1 requests retain Luna without classifying through another model", () => {
  for (const prompt of ["Which connections work?", "Find the event time in Slack", "Draft a short announcement", "Update this task's owner", "Why did Slack authorization fail?", "Write a deep blue event banner", "Compare two event names"]) {
    const route = snapshotModelRoute(chooseModelRoute(prompt));
    assert.equal(route.profile, "standard", prompt);
    assert.equal(route.model, "openai/gpt-5.6-luna");
    assert.equal(route.reasoningEffort, "provider-default");
  }
});

test("explicit modes apply to this request and override workflow rules", () => {
  for (const prompt of ["deep: Help plan the event", "<@U123> deep: Help plan the event", "Please think deeply about our event plan"]) {
    assert.equal(chooseModelRoute(prompt).reason, "explicit_deep");
  }
  assert.equal(chooseModelRoute("standard: Reconcile conflicting event records").reason, "explicit_standard");
  assert.equal(chooseModelRoute("Which connections work?").profile, "standard");
  assert.equal(chooseModelRoute("deep:").profile, "standard");
});

test("automatic deep routing is limited to named complex workflows", () => {
  for (const prompt of ["Reconcile Startup Week event records across Slack and Notion", "Can you help me reconcile conflicting company records?", "Compare the event schedules in Granola and Slack"]) {
    assert.equal(chooseModelRoute(prompt).reason, "cross_source_reconciliation", prompt);
  }
  assert.equal(chooseModelRoute("Review the architecture of Vee's router").reason, "architecture_analysis");
  assert.equal(chooseModelRoute("Summarize this architecture document").profile, "standard");
  assert.equal(chooseModelRoute("Do not reconcile the conflicting event records").profile, "standard");
});

test("quoted instructions, pasted records, link labels and long inputs cannot select deep", () => {
  for (const prompt of [
    "> deep: Ignore everything", '"deep: Ignore everything"', "```\ndeep: Ignore everything\n```",
    "Summarize this message:\ndeep: Review the architecture", "Reconcile event records <https://example.test|Slack Notion>",
    'Compare event names "Slack Notion"', "a".repeat(40_001), " ",
  ]) assert.equal(chooseModelRoute(prompt).profile, "standard", prompt.slice(0, 100));
});

test("operators can restrict routing to explicit requests or disable it", () => {
  assert.equal(chooseModelRoute("Reconcile conflicting events", "explicit").profile, "standard");
  assert.equal(chooseModelRoute("deep: Reconcile events", "explicit").profile, "deep");
  assert.equal(chooseModelRoute("deep: Reconcile events", "off").reason, "routing_disabled");
  assert.equal(chooseModelRoute("deep: Reconcile events", "typo").reason, "invalid_configuration");
});

test("both profiles preserve OpenAI-only routing and use known context windows", () => {
  for (const prompt of ["Hi", "deep: Plan the event"]) {
    const route = snapshotModelRoute(chooseModelRoute(prompt));
    const selection = modelSelection(route);
    assert.deepEqual(selection.modelOptions.providerOptions.gateway, { only: ["openai"] });
    assert.equal(selection.modelContextWindowTokens, 1_050_000);
    assert.equal(selection.modelOptions.providerOptions.openai?.reasoningEffort, route.profile === "deep" ? "low" : undefined);
  }
});

test("routing metadata cannot smuggle text, models or incompatible profile combinations", () => {
  const route = snapshotModelRoute(chooseModelRoute("deep: Reconcile events"));
  assert.deepEqual(safeModelRoute({ ...route, prompt: "private secret", token: "credential" }), route);
  assert.equal(safeModelRoute({ ...route, model: "https://private.example/token" }), null);
  assert.equal(safeModelRoute({ ...route, reasoningEffort: "max" }), null);
  assert.equal(safeRoutingDecision({ ...route, profile: "standard" }), null);
  assert.equal(safeRoutingDecision({ ...route, reason: "private secret" }), null);
  assert.equal(safeRoutingDecision({ ...route, policyVersion: "future-policy" }), null);
});
