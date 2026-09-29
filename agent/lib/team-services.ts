import { sharedAuth, type SharedConnectionName } from "./shared-auth.js";
import { ProviderFailure } from "./provider-errors.js";

type Service = { url: string; reads: readonly string[]; writes: readonly string[]; drafts?: readonly string[] };

// New provider tools are unavailable until classified here. Provider annotations
// and model descriptions cannot turn a write into a read or widen this list.
export const teamServices: Record<SharedConnectionName, Service> = {
  notion: {
    url: "https://mcp.notion.com/mcp",
    reads: ["notion-search", "notion-fetch", "notion-get-tool-access", "notion-query-data-sources", "notion-get-users", "notion-get-user", "notion-get-self", "notion-get-comments", "notion-get-teams", "notion-get-async-task"],
    writes: ["notion-create-pages", "notion-update-page", "notion-create-database", "notion-update-data-source", "notion-move-pages", "notion-duplicate-page", "notion-create-comment"],
  },
  granola: {
    url: "https://mcp.granola.ai/mcp",
    reads: ["query_granola_meetings", "list_meetings", "get_meetings", "get_meeting_transcript", "list_meeting_folders", "get_account_info"],
    writes: [],
  },
  "google-calendar": {
    url: "https://calendarmcp.googleapis.com/mcp/v1",
    reads: ["list_events", "get_event", "list_calendars", "suggest_time", "search_events"],
    writes: ["create_event", "update_event", "delete_event", "respond_to_event"],
  },
  github: {
    url: "https://api.githubcopilot.com/mcp/",
    reads: ["get_me", "get_file_contents", "list_branches", "issue_read", "list_issues", "search_issues", "list_pull_requests", "pull_request_read"],
    writes: ["create_branch", "create_or_update_file", "push_files", "issue_write", "create_pull_request"],
  },
  agentmail: {
    url: "https://mcp.agentmail.to/mcp",
    reads: ["get_inbox", "list_messages", "search_messages", "get_thread", "list_drafts", "get_draft"],
    writes: ["create_inbox", "send_draft", "send_message", "reply_to_message", "forward_message", "update_message"],
    drafts: ["create_draft", "update_draft"],
  },
};

export type TeamCall = { service: SharedConnectionName; tool: string; arguments: Record<string, unknown> };
export type TeamCallKind = "read" | "write" | "draft";

export function serviceAuth(name: SharedConnectionName) {
  return { provider: sharedAuth(name), options: { authKey: name, displayName: name, connection: { url: teamServices[name].url } } };
}

export function toolKind(service: SharedConnectionName, tool: string): TeamCallKind {
  const config = teamServices[service];
  if (config?.reads.includes(tool)) return "read";
  if (config?.writes.includes(tool)) return "write";
  if (config?.drafts?.includes(tool)) return "draft";
  throw new ProviderFailure("access_denied");
}

function assertRepository(args: Record<string, unknown>) {
  if (args.owner !== "V1Michigan" || !["vee", "website-v2"].includes(String(args.repo))) throw new ProviderFailure("access_denied");
}

function assertBranch(branch: unknown) {
  if (typeof branch !== "string" || !/^vee\/[a-zA-Z0-9][a-zA-Z0-9/_-]{0,150}$/.test(branch)
    || branch.includes("//") || branch.endsWith("/")) throw new ProviderFailure("access_denied");
}

function assertFile(path: unknown) {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\")
    || path.split("/").some((p) => ["..", ".", ".git", ""].includes(p))) throw new ProviderFailure("access_denied");
}

export function assertTeamCall(call: TeamCall, expected: "read" | "action"): TeamCallKind {
  const kind = toolKind(call.service, call.tool);
  if ((kind === "read") !== (expected === "read")) throw new ProviderFailure("access_denied");
  const args = call.arguments;
  if (!args || typeof args !== "object" || Array.isArray(args) || JSON.stringify(args).length > 32_000) throw new ProviderFailure("invalid_request");
  if (call.service !== "github") return kind;
  if (call.tool === "get_me") return kind;
  if (call.tool === "search_issues") {
    // A repository qualifier combined with OR, a negation, or another scope can
    // widen GitHub's query. Accept a single positive, literal repository scope.
    const query = args.query;
    if (typeof query !== "string" || /\b(?:OR|NOT)\b|[()]|\b(?:org|user|owner):/i.test(query)) throw new ProviderFailure("access_denied");
    const unquoted = query.replace(/"(?:\\.|[^"\\])*"/g, "");
    if (unquoted.includes('"')) throw new ProviderFailure("access_denied");
    const repos = [...unquoted.matchAll(/(?:^|\s)(-?repo):([^\s]+)/gi)];
    if (repos.length !== 1 || repos[0][1] !== "repo" || !["V1Michigan/vee", "V1Michigan/website-v2"].includes(repos[0][2])) throw new ProviderFailure("access_denied");
    // Reject quotes/parentheses around the qualifier, which alter its meaning.
    const rest = unquoted.replace(repos[0][0], "");
    if (/repo:/i.test(rest)) throw new ProviderFailure("access_denied");
    return kind;
  }
  assertRepository(args);
  if (kind === "read") return kind;
  if (["create_branch", "create_or_update_file", "push_files"].includes(call.tool)) assertBranch(args.branch);
  if (call.tool === "create_branch" && args.from_branch !== "main") throw new ProviderFailure("access_denied");
  if (call.tool === "create_or_update_file") assertFile(args.path);
  if (call.tool === "push_files") {
    if (!Array.isArray(args.files) || args.files.length === 0) throw new ProviderFailure("invalid_request");
    for (const file of args.files) assertFile(file?.path);
  }
  if (call.tool === "issue_write" && args.method !== "create") throw new ProviderFailure("access_denied");
  if (call.tool === "create_pull_request") {
    assertBranch(args.head);
    if (args.base !== "main" || args.draft !== true) throw new ProviderFailure("access_denied");
  }
  return kind;
}
