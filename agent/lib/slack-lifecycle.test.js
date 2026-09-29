import assert from "node:assert/strict";
import test from "node:test";
import { slackPublicAuth, slackPrivateAuth, publicSlackScopes, privateSlackScopes } from "./slack-auth.ts";
import { reconnectRequests, reconnectSlack } from "./slack-reconnect.ts";
import { privateSlackSession } from "./private-session.ts";
import { slackCaller, slackRolloutAllows, V1_SLACK_TEAM_ID as TEAM } from "./slack-policy.ts";

function authContext(user = "UA") {
  return { principal: { type: "user", id: `slack:${TEAM}:${user}`, issuer: `slack:${TEAM}` }, connection: { url: "https://mcp.slack.com/mcp" } };
}
function toolContext(user = "UA", surface = "shared", channel = surface === "dm" ? "DA" : "CA") {
  const current = { authenticator: "slack-webhook", principalType: "user", principalId: `slack:${TEAM}:${user}`, issuer: `slack:${TEAM}`,
    attributes: { team_id: TEAM, user_id: user, channel_id: channel, vee_surface: surface } };
  return { session: { id: "session", auth: { current, initiator: current }, turn: { id: "turn" } }, callId: "reconnect-1", toolName: "reconnect_slack", abortSignal: new AbortController().signal,
    getToken: async () => ({ token: "test-only" }), requireAuth: () => { throw new Error("OAUTH_PARK"); } };
}

test.beforeEach((t) => {
  const keys = ["VERCEL_OIDC_TOKEN", "VEE_SLACK_ROLLOUT", "VEE_SLACK_PILOT_USERS"];
  const old = keys.map((key) => process.env[key]);
  process.env.VERCEL_OIDC_TOKEN = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-only`;
  process.env.VEE_SLACK_ROLLOUT = "pilot";
  process.env.VEE_SLACK_PILOT_USERS = "UA,UB";
  t.after(() => { keys.forEach((key, i) => { if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i]; }); });
  let reconnects = {};
  let privateContext = false;
  t.mock.method(reconnectRequests, "get", () => reconnects);
  t.mock.method(reconnectRequests, "update", (fn) => { reconnects = fn(reconnects); });
  t.mock.method(privateSlackSession, "get", () => privateContext);
  t.mock.method(privateSlackSession, "update", (fn) => { privateContext = fn(privateContext); });
});

test("two users independently start and complete public OAuth with safe missing-grant errors", async (t) => {
  const allowed = new Set();
  const starts = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).includes("/authorize/")) {
      starts.push(body);
      return Response.json({ url: "https://auth.example/consent", deviceCode: "test-only", expiresAt: Date.now() + 600000 });
    }
    return allowed.has(body.subject.id) ? Response.json({ token: "test-only", expiresAt: Date.now() + 3600000 })
      : Response.json({ error: { code: "user_authorization_required", message: "private-provider-detail" } }, { status: 401 });
  });
  for (const user of ["UA", "UB"]) {
    const ctx = authContext(user);
    await assert.rejects(slackPublicAuth.getToken(ctx), (error) => error.name === "ConnectionAuthorizationRequiredError" && !error.message.includes("private-provider-detail"));
    const start = await slackPublicAuth.startAuthorization({ ...ctx, callbackUrl: "https://vee.example/oauth/callback" });
    assert.equal(start.challenge.url, "https://auth.example/consent");
    allowed.add(ctx.principal.id);
    assert.equal((await slackPublicAuth.completeAuthorization(ctx)).token, "test-only");
  }
  assert.notDeepEqual(starts[0].subject, starts[1].subject);
  assert.deepEqual(starts[0].scopes, publicSlackScopes);
  await slackPrivateAuth.startAuthorization({ ...authContext(), callbackUrl: "https://vee.example/oauth/callback" });
  assert.deepEqual(starts[2].scopes, privateSlackScopes);
});

test("declined consent is terminal and revoked grants start a new native OAuth flow", async (t) => {
  let code = "consent_denied";
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: { code, message: "private-provider-detail" } }, { status: 401 }));
  await assert.rejects(slackPrivateAuth.completeAuthorization(authContext()), (error) => {
    assert.equal(error.name, "ConnectionAuthorizationFailedError");
    assert.equal(error.reason, "authorization_denied");
    assert.equal(error.retryable, false);
    assert.doesNotMatch(error.message, /private-provider-detail/);
    return true;
  });
  code = "no_token";
  await assert.rejects(slackPublicAuth.getToken(authContext()), { name: "ConnectionAuthorizationRequiredError" });
});

test("reconnect parks once, binds the requester, and verifies the account on resume", async (t) => {
  let prompts = 0;
  const ctx = toolContext();
  ctx.requireAuth = () => { prompts++; throw new Error("OAUTH_PARK"); };
  await assert.rejects(reconnectSlack("public", ctx), /OAUTH_PARK/);
  await assert.rejects(reconnectSlack("public", toolContext("UB")), { code: "access_denied" });
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, team_id: TEAM, user_id: "UA" }));
  assert.equal((await reconnectSlack("public", ctx)).account, "verified_requester");
  assert.equal(prompts, 1);
});

test("private consent cannot start in a shared conversation or group DM", async () => {
  for (const ctx of [toolContext(), toolContext("UA", "dm", "GA")]) {
    ctx.requireAuth = () => assert.fail("No private consent on a shared surface");
    await assert.rejects(reconnectSlack("private", ctx), { code: "access_denied" });
  }
  assert.equal(privateSlackSession.get(), false);
});

test("rollout fails closed until pilot users or explicit broader enablement are configured", () => {
  assert.equal(slackRolloutAllows("UA"), true);
  assert.equal(slackRolloutAllows("UC"), false);
  delete process.env.VEE_SLACK_ROLLOUT;
  delete process.env.VEE_SLACK_PILOT_USERS;
  assert.equal(slackRolloutAllows("UA"), false);
  assert.throws(() => slackCaller(toolContext()), { code: "access_denied" });
  process.env.VEE_SLACK_ROLLOUT = "enabled";
  assert.equal(slackRolloutAllows("UA"), true);
  process.env.VEE_SLACK_ROLLOUT = "disabled";
  assert.equal(slackRolloutAllows("UA"), false);
});
