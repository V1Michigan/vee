import assert from "node:assert/strict";
import test from "node:test";
import { checkConnections, connectionRecovery } from "./connection-status.ts";
import { privateSlackSession } from "./private-session.ts";

const ctx = (user = "UA") => {
  const current = { authenticator: "slack-webhook", principalType: "user", principalId: `slack:T02UZ8D4ZMY:${user}`, issuer: "slack:T02UZ8D4ZMY", attributes: { team_id: "T02UZ8D4ZMY", user_id: user, channel_id: "CA" } };
  return { session: { auth: { current, initiator: current } }, abortSignal: new AbortController().signal };
};
const report = (name) => ({ name, credential: "available", identity: "verified", handshake: "verified", retrieval: "verified" });
test.beforeEach((t) => {
  const previous = process.env.VEE_SLACK_ROLLOUT;
  process.env.VEE_SLACK_ROLLOUT = "enabled";
  t.after(() => previous === undefined ? delete process.env.VEE_SLACK_ROLLOUT : process.env.VEE_SLACK_ROLLOUT = previous);
  t.mock.method(privateSlackSession, "get", () => false);
});

test("connection checks always derive Slack identity from the current requester", async () => {
  const seen = [];
  const probe = async (name, user) => { seen.push([name, user]); return report(name); };
  await checkConnections(["slack-search"], ctx("UA"), probe);
  await checkConnections(["slack-search", "github"], ctx("UB"), probe);
  assert.deepEqual(seen, [["slack-search", "UA"], ["slack-search", "UB"], ["github", undefined]]);
  await assert.rejects(checkConnections(["slack-search"], { session: { auth: {} } }, probe), { code: "access_denied" });
});

test("connection status distinguishes stages and never returns probe source data", async () => {
  const result = await checkConnections(["notion"], ctx(), async (name) => ({ ...report(name), credential: "unavailable", retrieval: "not_checked", failure: { stage: "credential", code: "authorization_required", raw: "private-secret" }, content: "private-secret" }));
  assert.equal(result.reports[0].failure.stage, "credential");
  assert.match(result.reports[0].recovery, /administrator/);
  assert.equal(result.writeJournal.connectivity, "not_checked");
  assert.doesNotMatch(JSON.stringify(result), /private-secret/);
  assert.notEqual(connectionRecovery("slack-search", "authorization_required"), connectionRecovery("slack-search", "provider_configuration"));
});

test("private session checks cannot reach other providers", async (t) => {
  t.mock.method(privateSlackSession, "get", () => true);
  const seen = [];
  const result = await checkConnections(["notion", "slack-search"], ctx(), async (name) => { seen.push(name); return report(name); });
  assert.deepEqual(seen, ["slack-search"]);
  assert.equal(result.reports[0].failure.code, "private_session_restricted");
});

test("checks limit concurrency and redact thrown failures", async () => {
  let running = 0, peak = 0;
  const result = await checkConnections(undefined, ctx(), async (name) => {
    running++; peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5)); running--;
    if (name === "notion") throw new Error("private-secret");
    return report(name);
  });
  assert.equal(peak, 2);
  assert.equal(result.reports.length, 6);
  assert.doesNotMatch(JSON.stringify(result), /private-secret/);
});
