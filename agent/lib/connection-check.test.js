import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { checkConnection, formatConnectionCheck, slackCheckGrant } from "./connection-check.ts";
import { V1_SLACK_TEAM_ID as TEAM } from "./slack-policy.ts";

function mockProvider(t, options = {}) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).endsWith("auth.test")) return Response.json({ ok: true, team_id: TEAM, user_id: options.user ?? "UA" });
    if (options.handshakeFailure) return new Response("App is not enabled for Slack MCP server access. secret-token", { status: 400 });
    if (!init?.body) return new Response(null, { status: 405 });
    const rpc = JSON.parse(init.body);
    calls.push(rpc);
    if (rpc.method.startsWith("notifications/")) return new Response(null, { status: 202 });
    const result = rpc.method === "initialize"
      ? { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } }
      : rpc.method === "tools/list" ? { tools: [{ name: "slack_search_public", inputSchema: { type: "object" } }] }
      : options.missingScope ? { isError: true, content: [{ type: "text", text: "missing_scope secret-token private-record" }] }
      : { content: [{ type: "text", text: "private-record should never appear in diagnostics" }] };
    return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
  });
  return calls;
}
const tokenProvider = async () => ({ token: "test-only" });

test("credential availability, MCP configuration, and successful retrieval are distinct", async (t) => {
  mockProvider(t, { handshakeFailure: true });
  const failed = await checkConnection("slack-search", "UA", tokenProvider);
  assert.equal(failed.credential, "available");
  assert.equal(failed.identity, "verified");
  assert.equal(failed.handshake, "not_checked");
  assert.deepEqual(failed.failure, { stage: "handshake", code: "provider_configuration" });
  assert.doesNotMatch(formatConnectionCheck(failed), /secret-token/);
});

test("missing grants and a missing connector have different diagnostic codes", async () => {
  const missing = await checkConnection("slack-search", "UA", async () => { throw { code: "user_authorization_required", status: 401 }; });
  const configuration = await checkConnection("google-calendar", undefined, async () => { throw { name: "ConnectError", code: "not_found", status: 404, message: "Connector calendar is not found. secret-token" }; });
  assert.deepEqual(missing.failure, { stage: "credential", code: "authorization_required" });
  assert.deepEqual(configuration.failure, { stage: "credential", code: "provider_configuration" });
  assert.equal(missing.credential, "unavailable");
  assert.doesNotMatch(formatConnectionCheck(configuration), /secret-token/);
});

test("a successful per-user check performs an identity check, handshake, and public read", async (t) => {
  const calls = mockProvider(t);
  let grant;
  const report = await checkConnection("slack-search", "UA", async (connector, params, options) => { grant = { connector, params, options }; return tokenProvider(); });
  assert.equal(report.retrieval, "verified");
  assert.equal(report.failure, undefined);
  assert.deepEqual(grant.params.subject, { type: "user", id: `slack:${TEAM}:UA`, issuer: `slack:${TEAM}` });
  assert.equal(grant.options.forceRefresh, true);
  const call = calls.find((call) => call.method === "tools/call");
  assert.equal(call.params.name, "slack_search_public");
  assert.equal(call.params.arguments.include_bots, true);
  assert.doesNotMatch(JSON.stringify(report), /private-record|test-only/);
  assert.notDeepEqual(slackCheckGrant("UA").params.subject, slackCheckGrant("UB").params.subject);
});

test("wrong account and missing retrieval scopes stop at the correct diagnostic stage", async (t) => {
  const calls = mockProvider(t, { user: "UB" });
  const mismatch = await checkConnection("slack-search", "UA", tokenProvider);
  assert.deepEqual(mismatch.failure, { stage: "identity", code: "wrong_account" });
  assert.equal(calls.length, 0);
  mockProvider(t, { missingScope: true });
  const scope = await checkConnection("slack-search", "UA", tokenProvider);
  assert.equal(scope.handshake, "verified");
  assert.deepEqual(scope.failure, { stage: "retrieval", code: "missing_scope" });
});

test("the CLI retires shared Slack authorization and refuses unscoped Slack checks", () => {
  for (const args of [["authorize", "slack-search"], ["check", "slack-search"]]) {
    const result = spawnSync(process.execPath, ["--import", "./scripts/test-loader.js", "scripts/connections.js", ...args], { cwd: new URL("../../", import.meta.url), encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /retired|--slack-user/);
    assert.doesNotMatch(result.stdout, /https:\/\/.*authorize|Bearer/);
  }
});
