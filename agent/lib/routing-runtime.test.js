import assert from "node:assert/strict";
import test from "node:test";
import agent from "../agent.ts";
import { slackInbound } from "./slack-inbound.ts";
import { routeForTurn, turnModelRoute } from "./routing-state.ts";
import { assertNoPrivateSlackExport, privateSlackSession } from "./private-session.ts";
import { slackCaller, V1_SLACK_TEAM_ID as TEAM } from "./slack-policy.ts";

const started = (turnId) => ({ type: "turn.started", data: { turnId, sequence: 0 } });
const select = (turnId, ctx) => agent.model.events["turn.started"](started(turnId), ctx);

function request(text, user = "UA", surface = "shared") {
  const channelId = surface === "dm" ? `D${user}` : "CA";
  const message = { text, markdown: text, teamId: TEAM, channelId, ts: "1", threadTs: "1", attachments: [], raw: {},
    author: { userId: user, userName: user, isBot: false, isMe: false } };
  const inbound = slackInbound({ slack: { channelId, threadTs: "1", teamId: TEAM } }, message, surface);
  return { session: { id: "shared-thread", auth: { current: inbound?.auth ?? null, initiator: inbound?.auth ?? null } }, channel: { kind: "slack" }, messages: [] };
}

test.beforeEach((t) => {
  const keys = ["VEE_MODEL_ROUTING", "VEE_SLACK_ROLLOUT", "VEE_SLACK_PILOT_USERS", "VEE_SLACK_TEAM_ID"];
  const before = keys.map((key) => process.env[key]);
  process.env.VEE_MODEL_ROUTING = "auto";
  process.env.VEE_SLACK_ROLLOUT = "pilot";
  process.env.VEE_SLACK_PILOT_USERS = "UA,UB";
  process.env.VEE_SLACK_TEAM_ID = TEAM;
  t.after(() => keys.forEach((key, i) => before[i] === undefined ? delete process.env[key] : process.env[key] = before[i]));
  let state = null;
  t.mock.method(turnModelRoute, "get", () => state);
  t.mock.method(turnModelRoute, "update", (fn) => { state = fn(state); });
  t.mock.method(globalThis, "fetch", () => assert.fail("Routing must not call any provider"));
});

test("the Eve entrypoint selects once per turn and two users in one thread route independently", () => {
  assert.deepEqual(Object.keys(agent.model.events), ["turn.started"]);
  assert.equal(agent.model.fallback, "openai/gpt-5.6-luna");
  const first = request("<@UVEE> deep: Reconcile events", "UA");
  assert.equal(select("turn-a", first).model, "openai/gpt-5.6-sol");
  const next = request("Find the event time", "UB");
  next.session.auth.initiator = first.session.auth.current;
  next.messages = [{ role: "user", content: "deep: This is another user's earlier message" }];
  assert.equal(select("turn-b", next).model, "openai/gpt-5.6-luna");
  assert.equal(routeForTurn("turn-a"), null);
  assert.equal(routeForTurn("turn-b").reason, "routine_request");
});

test("replay and OAuth or approval resumes preserve the original turn selection", () => {
  const original = select("turn-a", request("deep: Reconcile events"));
  process.env.VEE_MODEL_ROUTING = "off";
  const continuation = request("approved");
  delete continuation.session.auth.current.attributes.vee_route_profile;
  delete continuation.session.auth.current.attributes.vee_route_reason;
  delete continuation.session.auth.current.attributes.vee_route_policy;
  assert.deepEqual(select("turn-a", continuation), original);
  assert.deepEqual(select("turn-a", request("standard: Do something else", "UB")), original);
  assert.equal(select("turn-b", request("deep: Reconcile events")).model, "openai/gpt-5.6-luna");
  assert.equal(routeForTurn("turn-b").reason, "routing_disabled");
});

test("only current verified Slack metadata may choose a deep route", () => {
  const valid = request("deep: Reconcile events");
  for (const mutate of [
    (ctx) => { ctx.session.auth.current = null; },
    (ctx) => { ctx.session.auth.current.authenticator = "http"; },
    (ctx) => { ctx.session.auth.current.attributes.team_id = "TOTHER"; },
    (ctx) => { ctx.session.auth.current.principalId = `slack:${TEAM}:UB`; },
    (ctx) => { ctx.session.auth.current.attributes.vee_route_reason = "untrusted-secret"; },
    (ctx) => { ctx.session.auth.current.attributes.vee_route_policy = "untrusted-secret"; },
  ]) {
    const ctx = structuredClone(valid);
    mutate(ctx);
    assert.equal(select(crypto.randomUUID(), ctx).model, "openai/gpt-5.6-luna");
  }
  assert.equal(request("deep: Reconcile events", "UC").session.auth.current, null);
});

test("private DMs retain their audience and export restrictions on either model", (t) => {
  t.mock.method(privateSlackSession, "get", () => true);
  for (const [index, prompt] of ["deep: Review these private records", "standard: Review these private records"].entries()) {
    const ctx = request(prompt, "UA", "dm");
    const before = structuredClone(ctx.session.auth);
    const selected = select(`dm-${index}`, ctx);
    assert.deepEqual(selected.modelOptions.providerOptions.gateway.only, ["openai"]);
    assert.deepEqual(ctx.session.auth, before);
    assert.equal(slackCaller(ctx, "private").userId, "UA");
    assert.throws(assertNoPrivateSlackExport, { code: "private_session_restricted" });
  }
  assert.throws(() => slackCaller(request("deep: Review private records"), "private"), { code: "access_denied" });
});

test("missing state fails cheaply without logging request content or a raw exception", (t) => {
  const warnings = [];
  t.mock.method(console, "warn", (message) => warnings.push(message));
  t.mock.method(turnModelRoute, "get", () => { throw new Error("private state error"); });
  t.mock.method(turnModelRoute, "update", () => { throw new Error("private state error"); });
  assert.equal(select("turn-a", request("deep: private request")).model, "openai/gpt-5.6-luna");
  assert.equal(routeForTurn("turn-a"), null);
  assert.deepEqual(warnings, ["vee.routing_unavailable"]);
});

test("routing configuration can narrow a queued request without broadening permissions", () => {
  const automatic = request("Reconcile conflicting event records");
  process.env.VEE_MODEL_ROUTING = "explicit";
  assert.equal(select("turn-a", automatic).model, "openai/gpt-5.6-luna");
  assert.equal(select("turn-b", request("deep: Reconcile records")).model, "openai/gpt-5.6-sol");
  process.env.VEE_MODEL_ROUTING = "typo";
  assert.equal(select("turn-c", request("deep: Reconcile records")).model, "openai/gpt-5.6-luna");
  assert.equal(routeForTurn("turn-c").reason, "invalid_configuration");
});
