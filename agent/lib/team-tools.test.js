import assert from "node:assert/strict";
import test from "node:test";
import { actionApprovals, actionDigest, approveTeamAction, assertApprovedAction } from "./action-approval.ts";
import { claimWriteAttempt } from "./action-journal.ts";
import { approvalReviewPosts } from "./approval-review.ts";
import { assertTeamCall, teamServices } from "./team-services.ts";
import { executeTeamAction, findTeamTools, readTeamData } from "./team-tools.ts";
import { privateSlackSession } from "./private-session.ts";
import { V1_SLACK_TEAM_ID as TEAM } from "./slack-policy.ts";

function context(user = "UA", callId = "call-1") {
  const current = { authenticator: "slack-webhook", principalType: "user", principalId: `slack:${TEAM}:${user}`, issuer: `slack:${TEAM}`,
    attributes: { user_id: user, team_id: TEAM, channel_id: "CA", vee_surface: "shared" } };
  return { session: { id: "session", turn: { id: "turn" }, auth: { current, initiator: current } }, callId, toolName: "execute_team_action", approvedTools: new Set(),
    abortSignal: new AbortController().signal, getToken: async () => ({ token: "test-only" }), requireAuth: () => assert.fail("An organizational write must not restart interactive OAuth") };
}
const issue = { service: "github", tool: "issue_write", arguments: { owner: "V1Michigan", repo: "vee", method: "create", title: "Test", body: "Proposed issue." } };

test.beforeEach((t) => {
  let bindings = {};
  let privateContext = false;
  t.mock.method(actionApprovals, "get", () => bindings);
  t.mock.method(actionApprovals, "update", (fn) => { bindings = fn(bindings); });
  t.mock.method(privateSlackSession, "get", () => privateContext);
  t.mock.method(privateSlackSession, "update", (fn) => { privateContext = fn(privateContext); });
});

function propose(input = issue, ctx = context()) {
  return approveTeamAction({ ...ctx, toolInput: input });
}

function provider(t, options = {}) {
  const calls = [];
  const latches = new Map();
  const old = [process.env.VEE_ACTION_REDIS_REST_URL, process.env.VEE_ACTION_REDIS_REST_TOKEN];
  process.env.VEE_ACTION_REDIS_REST_URL = "https://journal.test";
  process.env.VEE_ACTION_REDIS_REST_TOKEN = "journal-test-token";
  t.after(() => {
    for (const [i, key] of ["VEE_ACTION_REDIS_REST_URL", "VEE_ACTION_REDIS_REST_TOKEN"].entries()) {
      if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i];
    }
  });
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url) === "https://journal.test/") {
      if (options.badJournal) throw new Error("fetch failed with private-token");
      const [command, key, value, condition] = JSON.parse(init.body);
      assert.equal(command, "SET"); assert.equal(condition, "NX");
      assert.match(key, /^vee:write:v1:[a-f0-9]{64}$/);
      assert.match(value, /^[a-f0-9]{64}$/);
      const exists = latches.has(key);
      latches.set(key, value);
      return Response.json({ result: exists ? null : "OK" });
    }
    assert.ok(Object.values(teamServices).some((service) => String(url) === service.url));
    if (!init?.body) return new Response(null, { status: 405 });
    const rpc = JSON.parse(init.body);
    calls.push(rpc);
    if (rpc.method.startsWith("notifications/")) return new Response(null, { status: 202 });
    let result;
    if (rpc.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } };
    else if (rpc.method === "tools/list") result = { tools: (options.tools ?? ["issue_write", "get_file_contents"]).map((name) => ({ name, inputSchema: { type: "object" } })) };
    else if (rpc.method === "tools/call") {
      if (options.outage) throw new Error("fetch failed private-token private-record");
      result = options.result ?? { content: [{ type: "text", text: JSON.stringify({ url: "https://github.com/V1Michigan/vee/issues/1" }) }] };
    } else assert.fail(rpc.method);
    return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
  });
  return { calls, latches };
}

test("every external mutation requires approval, with only AgentMail draft preparation exempted", () => {
  assert.equal(propose(), "user-approval");
  for (const tool of ["create_draft", "update_draft"]) assert.equal(propose({ service: "agentmail", tool, arguments: {} }, context("UA", tool)), "not-applicable");
  for (const [service, tool] of [["agentmail", "send_draft"], ["agentmail", "update_message"], ["google-calendar", "delete_event"], ["notion", "notion-update-page"]]) {
    assert.equal(propose({ service, tool, arguments: {} }, context("UA", tool)), "user-approval");
  }
  assert.equal(propose({ ...issue, tool: "delete_repository" }).type, "denied");
});

test("the execution binding rejects another approver, changed arguments, and another tool or call", async () => {
  assert.equal(propose(), "user-approval");
  assert.doesNotThrow(() => assertApprovedAction(issue, context()));
  for (const [input, ctx] of [[issue, context("UB")], [{ ...issue, arguments: { ...issue.arguments, title: "Changed" } }, context()], [issue, { ...context(), toolName: "other" }], [issue, context("UA", "different-call")]]) {
    ctx.getToken = () => assert.fail("Reject before credentials or provider access");
    await assert.rejects(executeTeamAction(input, ctx), { code: "access_denied" });
  }
  assert.equal(propose(issue, context("UB")).type, "denied");
  assert.equal(propose({ ...issue, arguments: { ...issue.arguments, title: "Changed" } }).type, "denied");
  assert.equal(propose({ ...issue, arguments: { ...issue.arguments, title: "Changed" } }, context("UA", "new-call")), "user-approval");
});

test("argument binding is independent of object order and covers nested values", () => {
  const reordered = { arguments: { body: "Proposed issue.", title: "Test", method: "create", repo: "vee", owner: "V1Michigan" }, tool: "issue_write", service: "github" };
  assert.equal(actionDigest(issue), actionDigest(reordered));
  assert.notEqual(actionDigest(issue), actionDigest({ ...issue, arguments: { ...issue.arguments, labels: ["changed"] } }));
});

test("GitHub repository, branch, query, issue-create, and draft PR restrictions are enforced", () => {
  for (const args of [{ ...issue.arguments, owner: "Elsewhere" }, { ...issue.arguments, repo: "other" }, { ...issue.arguments, method: "update" }]) {
    assert.throws(() => assertTeamCall({ ...issue, arguments: args }, "action"), { code: "access_denied" });
  }
  for (const branch of ["main", "refs/heads/main", "vee/../main", "vee/topic.lock", "vee//topic", "other/topic"]) {
    assert.throws(() => assertTeamCall({ ...issue, tool: "create_branch", arguments: { owner: "V1Michigan", repo: "vee", branch } }, "action"));
  }
  assert.throws(() => assertTeamCall({ ...issue, tool: "create_branch", arguments: { owner: "V1Michigan", repo: "vee", branch: "vee/topic" } }, "action"));
  assert.equal(assertTeamCall({ ...issue, tool: "create_branch", arguments: { owner: "V1Michigan", repo: "vee", branch: "vee/topic", from_branch: "main" } }, "action"), "write");
  const pr = { service: "github", tool: "create_pull_request", arguments: { owner: "V1Michigan", repo: "website-v2", base: "main", head: "vee/fix", draft: true } };
  assert.equal(assertTeamCall(pr, "action"), "write");
  for (const patch of [{ draft: false }, { head: "main" }, { base: "release" }]) assert.throws(() => assertTeamCall({ ...pr, arguments: { ...pr.arguments, ...patch } }, "action"));
  for (const query of ["repo:V1Michigan/vee OR repo:other/private", "repo:V1Michigan/vee org:Other", "-repo:V1Michigan/vee", '"repo:V1Michigan/vee"', "NOT repo:V1Michigan/vee", "repo:V1Michigan/other", "is:open"]) {
    assert.throws(() => assertTeamCall({ service: "github", tool: "search_issues", arguments: { query } }, "read"), { code: "access_denied" });
  }
  assert.equal(assertTeamCall({ service: "github", tool: "search_issues", arguments: { query: 'repo:V1Michigan/vee is:open "Slack search"' } }, "read"), "read");
});

test("reads cannot dispatch writes and unsupported provider tools fail before OAuth", async () => {
  const ctx = context();
  ctx.getToken = () => assert.fail("No credentials for a rejected operation");
  await assert.rejects(readTeamData(issue, ctx), { code: "access_denied" });
  await assert.rejects(findTeamTools("notion", ["notion-ai-search"], ctx), { code: "access_denied" });
  await assert.rejects(readTeamData({ service: "granola", tool: "delete_meeting", arguments: {} }, ctx), { code: "access_denied" });
});

test("a denied proposal cannot silently inherit an earlier approval", () => {
  assert.equal(propose(), "user-approval");
  // Eve does not execute after Deny. A new call must request approval again,
  // even if Eve's per-tool approved set is populated.
  const ctx = { ...context("UA", "next-call"), approvedTools: new Set(["execute_team_action"]) };
  assert.throws(() => assertApprovedAction(issue, ctx), { code: "access_denied" });
  assert.equal(propose(issue, ctx), "user-approval");
});

test("an interrupted write is not retried and replay cannot dispatch it again", async (t) => {
  const fixture = provider(t, { outage: true });
  propose();
  await assert.rejects(executeTeamAction(issue, context()), { code: "outcome_unknown" });
  assert.equal(fixture.calls.filter((call) => call.method === "tools/call").length, 1);
  assert.equal(fixture.latches.size, 1);
  // Simulate a new worker restored to the pre-write approval checkpoint.
  actionApprovals.update(() => ({}));
  propose();
  await assert.rejects(executeTeamAction(issue, context()), { code: "outcome_unknown" });
  assert.equal(fixture.calls.filter((call) => call.method === "tools/call").length, 1);
});

test("a successful write has a durable latch and one provider dispatch", async (t) => {
  const fixture = provider(t);
  propose();
  const result = await executeTeamAction(issue, context());
  assert.equal(result.status, "completed");
  assert.deepEqual(result.citations, ["https://github.com/V1Michigan/vee/issues/1"]);
  assert.equal(fixture.calls.filter((call) => call.method === "tools/call").length, 1);
  await assert.rejects(executeTeamAction(issue, context()), { code: "outcome_unknown" });
});

test("an unavailable journal prevents provider writes", async (t) => {
  const fixture = provider(t, { badJournal: true });
  propose();
  await assert.rejects(executeTeamAction(issue, context()), { code: "write_journal_unavailable" });
  assert.equal(fixture.calls.filter((call) => call.method === "tools/call").length, 0);
  delete process.env.VEE_ACTION_REDIS_REST_TOKEN;
  await assert.rejects(claimWriteAttempt({ sessionId: "s", callId: "c", digest: "d" }), { code: "write_journal_unavailable" });
});

test("a shared Notion search fails before retrieval if connected-source search is enabled", async (t) => {
  const fixture = provider(t, { tools: ["notion-search", "notion-ai-search", "notion-fetch"] });
  await assert.rejects(readTeamData({ service: "notion", tool: "notion-search", arguments: { query: "V1" } }, context()), { code: "connected_search_enabled" });
  assert.equal(fixture.calls.filter((call) => call.method === "tools/call").length, 0);
  await readTeamData({ service: "notion", tool: "notion-fetch", arguments: { id: "page-id" } }, context());
  assert.equal(fixture.calls.filter((call) => call.method === "tools/call").length, 1);
});

test("Notion workspace-only search and discovery preserve the local allowlist", async (t) => {
  provider(t, { tools: ["notion-search", "notion-fetch", "notion-spawn-session"] });
  const catalog = await findTeamTools("notion", undefined, context());
  assert.deepEqual(catalog.tools.map((tool) => tool.name), ["notion-search", "notion-fetch"]);
  assert.equal(catalog.tools[0].inputSchema, undefined);
  const schema = await findTeamTools("notion", ["notion-search"], context());
  assert.deepEqual(schema.tools[0].inputSchema, { type: "object" });
  const result = await readTeamData({ service: "notion", tool: "notion-search", arguments: { query: "V1" } }, context());
  assert.equal(result.coverage, "retrieved_subset");
});

test("private Slack session contents cannot be exported via shared providers or actions", async () => {
  propose();
  privateSlackSession.update(() => true);
  const ctx = context();
  ctx.getToken = () => assert.fail("No export after private retrieval");
  await assert.rejects(executeTeamAction(issue, ctx), { code: "private_session_restricted" });
  await assert.rejects(readTeamData({ service: "notion", tool: "notion-search", arguments: { query: "private context" } }, ctx), { code: "private_session_restricted" });
  assert.equal(propose(issue, context("UA", "new")).type, "denied");
});

test("approval review preserves large arguments and delivers buttons after the entire payload", () => {
  const content = "Approved code 🛠️\n".repeat(1_000);
  const input = { service: "github", tool: "push_files", arguments: { owner: "V1Michigan", repo: "vee", branch: "vee/test", files: [{ path: "file.txt", content }] } };
  const request = { requestId: "review-1", prompt: "Review this change", display: "confirmation", action: { kind: "tool-call", callId: "call-1", toolName: "execute_team_action", input }, options: [{ id: "approve", label: "Allow" }, { id: "deny", label: "Deny" }] };
  const posts = approvalReviewPosts(request, "UA");
  const review = posts.slice(0, -1).flatMap((post) => post.blocks).map((block) => block.text.text).join("");
  assert.ok(review.includes(JSON.stringify(input, null, 2)));
  assert.ok(posts.slice(0, -1).every((post) => post.blocks.every((block) => block.type !== "actions")));
  assert.equal(posts.at(-1).blocks.at(-1).elements[0].action_id, "eve_input:review-1:button:0");
  assert.match(posts.at(-1).text, /Only UA/);
});
