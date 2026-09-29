import assert from "node:assert/strict";
import test from "node:test";
import { slackCaller, V1_SLACK_TEAM_ID as TEAM } from "./slack-policy.ts";
import { retrieveSlack, searchArguments, slackResult } from "./slack-retrieval.ts";
import { slackPublicAuth, slackPrivateAuth, publicSlackScopes, privateSlackScopes } from "./slack-auth.ts";
import { classifyFailure, ProviderFailure } from "./provider-errors.ts";
import { retryRead } from "./provider-client.ts";
import { privateSlackSession } from "./private-session.ts";

test.beforeEach((t) => {
  let marked = false;
  t.mock.method(privateSlackSession, "get", () => marked);
  t.mock.method(privateSlackSession, "update", (fn) => { marked = fn(marked); });
});

function actor(user = "UA", surface = "shared", channel = surface === "dm" ? "DA" : "CA") {
  return { authenticator: "slack-webhook", principalType: "user", principalId: `slack:${TEAM}:${user}`, issuer: `slack:${TEAM}`,
    attributes: { user_id: user, team_id: TEAM, channel_id: channel, vee_surface: surface } };
}
function context(current = actor(), initiator = current) {
  return { session: { id: "session", turn: { id: "turn" }, auth: { current, initiator } }, abortSignal: new AbortController().signal,
    getToken: async () => ({ token: "test-only" }), requireAuth() { throw new Error("OAUTH_PARK"); } };
}
const query = { scope: "public", keywords: ["Startup"], limit: 10, sort: "score" };
const channelInfo = { id: "CA", is_channel: true, is_im: false, is_mpim: false, is_private: false };
const sample = { content: [{ type: "text", text: JSON.stringify({ results: "From: Tally Forms (bot)\nCompany: Acme\nPermalink: https://v1michigan.slack.com/archives/CA/p123456\n", pagination_info: "For the next page use cursor `next-page`" }) }] };

function mockSlack(t, options = {}) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const address = String(url);
    if (address.endsWith("auth.test")) return Response.json({ ok: true, team_id: options.team ?? TEAM, user_id: options.user ?? "UA" });
    if (address.endsWith("conversations.info")) return Response.json({ ok: true, channel: { ...channelInfo, ...options.channel } });
    assert.equal(address, "https://mcp.slack.com/mcp");
    if (!init?.body) return new Response(null, { status: 405 });
    const rpc = JSON.parse(init.body);
    calls.push(rpc);
    if (rpc.method.startsWith("notifications/")) return new Response(null, { status: 202 });
    let result;
    if (rpc.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "slack-fixture", version: "1" } };
    else if (rpc.method === "tools/list") result = { tools: [{ name: "slack_search_public_and_private", inputSchema: { type: "object", properties: options.noPrivateFilter ? {} : { channel_types: { type: "string" } } } }] };
    else if (rpc.method === "tools/call") result = options.result ?? sample;
    else assert.fail(`Unexpected MCP method ${rpc.method}`);
    return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
  });
  return calls;
}

test("public searches include integration bots and preserve citations and pagination", async (t) => {
  const calls = mockSlack(t);
  const result = await retrieveSlack(query, context());
  const call = calls.find((c) => c.method === "tools/call");
  assert.equal(call.params.name, "slack_search_public");
  assert.equal(call.params.arguments.include_bots, true);
  assert.equal(call.params.arguments.content_types, "messages");
  assert.equal(result.nextCursor, "next-page");
  assert.equal(result.coverage, "retrieved_subset");
  assert.match(result.text, /Tally/);
  assert.deepEqual(result.citations, ["https://v1michigan.slack.com/archives/CA/p123456"]);
});

test("private searches constrain the upstream call to private channels in the owner's DM", async (t) => {
  const calls = mockSlack(t);
  await retrieveSlack({ ...query, scope: "private" }, context(actor("UA", "dm")));
  const call = calls.find((c) => c.method === "tools/call");
  assert.equal(call.params.name, "slack_search_public_and_private");
  assert.equal(call.params.arguments.channel_types, "private_channel");
  assert.ok(calls.some((c) => c.method === "tools/list"));
});

test("a server that cannot enforce channel_types fails before private search", async (t) => {
  const calls = mockSlack(t, { noPrivateFilter: true });
  await assert.rejects(retrieveSlack({ ...query, scope: "private" }, context(actor("UA", "dm"))), { code: "provider_configuration" });
  assert.ok(!calls.some((c) => c.method === "tools/call"));
});

test("shared conversations and another user's DM cannot initiate private OAuth or retrieval", async () => {
  for (const ctx of [context(), context(actor("UB", "dm"), actor("UA", "dm")), context(actor("UA", "dm", "DB"), actor("UA", "dm", "DA"))]) {
    ctx.getToken = () => assert.fail("Must reject before obtaining a token");
    await assert.rejects(retrieveSlack({ ...query, scope: "private" }, ctx), { code: "access_denied" });
  }
});

test("native approval continuations retain only their own pinned DM scope", () => {
  const owner = actor("UA", "dm");
  const resumed = { ...owner, attributes: { ...owner.attributes } };
  delete resumed.attributes.vee_surface;
  assert.equal(slackCaller(context(resumed, owner), "private").personalDm, true);
  assert.throws(() => slackCaller(context(actor("UB", "dm"), owner), "private"), { code: "access_denied" });
});

test("wrong Slack account or workspace fails before the MCP handshake", async (t) => {
  for (const options of [{ user: "UB" }, { team: "TOTHER" }]) {
    const calls = mockSlack(t, options);
    await assert.rejects(retrieveSlack(query, context()), { code: "wrong_account" });
    assert.equal(calls.length, 0);
  }
});

test("private and DM channel reads are rejected before reading messages", async (t) => {
  for (const channel of [{ is_private: true }, { is_im: true }, { is_mpim: true }, { is_private: undefined }]) {
    const calls = mockSlack(t, { channel });
    await assert.rejects(retrieveSlack({ scope: "public", channelId: "CA", threadTs: "123.456", limit: 20 }, context()), { code: "access_denied" });
    assert.equal(calls.length, 0);
  }
});

test("authorized private thread reads and public thread reads select the right MCP tool", async (t) => {
  for (const scope of ["public", "private"]) {
    const calls = mockSlack(t, { channel: { is_private: scope === "private" } });
    await retrieveSlack({ scope, channelId: "CA", threadTs: "123.456", limit: 20 }, context(actor("UA", "dm")));
    assert.equal(calls.find((c) => c.method === "tools/call").params.name, "slack_read_thread");
  }
});

test("DM filters and foreign principals fail closed", () => {
  for (const filters of ["is:dm", "in:@someone", "in:D123"]) assert.throws(() => searchArguments({ ...query, filters }), { code: "access_denied" });
  for (const change of [{ authenticator: "app" }, { principalId: "slack:someone-else" }, { issuer: "slack:TOTHER" }]) {
    assert.throws(() => slackCaller(context({ ...actor(), ...change })), { code: "access_denied" });
  }
});

test("two users receive different Connect grants even in the same shared thread", async (t) => {
  const requests = [];
  const previous = process.env.VERCEL_OIDC_TOKEN;
  process.env.VERCEL_OIDC_TOKEN = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-only`;
  t.after(() => { if (previous === undefined) delete process.env.VERCEL_OIDC_TOKEN; else process.env.VERCEL_OIDC_TOKEN = previous; });
  t.mock.method(globalThis, "fetch", async (_url, init) => { requests.push(JSON.parse(init.body)); return Response.json({ token: "test-only", expiresAt: Date.now() + 3600000 }); });
  for (const id of ["UA", "UB"]) await slackPublicAuth.getToken({ principal: { type: "user", id: `slack:${TEAM}:${id}`, issuer: `slack:${TEAM}` }, connection: { url: "https://mcp.slack.com/mcp" } });
  assert.notDeepEqual(requests[0].subject, requests[1].subject);
  assert.deepEqual(requests[0].scopes, publicSlackScopes);
  assert.equal(slackPublicAuth.principalType, "user");
  assert.equal(typeof slackPrivateAuth.startAuthorization, "function");
  assert.ok(!privateSlackScopes.some((s) => /^(?:search:read\.(?:im|mpim)|(?:im|mpim):)/.test(s)));
});

test("a revoked upstream token enters Eve's OAuth resume path", async (t) => {
  mockSlack(t, { result: { isError: true, content: [{ type: "text", text: "invalid_auth secret-should-not-escape" }] } });
  await assert.rejects(retrieveSlack(query, context()), /OAUTH_PARK/);
});

test("safe errors distinguish provider setup, permissions, consent, and outages", () => {
  const cases = [["App is not enabled for Slack MCP server access", "provider_configuration"], ["missing_scope", "missing_scope"], ["user_authorization_required", "authorization_required"], ["consent_denied", "authorization_denied"], ["fetch failed", "provider_unavailable"]];
  for (const [message, code] of cases) {
    const error = classifyFailure(new Error(`${message}: secret-token and private-message`));
    assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /secret-token|private-message/);
    assert.equal(error.cause, undefined);
  }
});

test("read retries are bounded and do not ignore a long Retry-After", async () => {
  let attempts = 0;
  await assert.rejects(retryRead(async () => { attempts++; throw new ProviderFailure("provider_unavailable"); }, undefined, async () => {}), { code: "provider_unavailable" });
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(retryRead(async () => { attempts++; throw new ProviderFailure("rate_limited", 60000); }, undefined, async () => assert.fail("Must not retry early")), { code: "rate_limited" });
  assert.equal(attempts, 1);
});

test("content is bounded before persistence without losing citation metadata", () => {
  const result = slackResult({ content: [{ type: "text", text: "x".repeat(25000) + " https://v1michigan.slack.com/archives/CA/p123456" }] });
  assert.equal(result.text.length, 24000);
  assert.equal(result.truncated, true);
  assert.equal(result.citations.length, 1);
});
