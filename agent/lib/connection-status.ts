import type { ToolContext } from "eve/tools";
import { checkConnection, type CheckName, type ConnectionCheck } from "./connection-check.js";
import { slackCaller } from "./slack-policy.js";
import { privateSlackSession } from "./private-session.js";
import { classifyFailure, ProviderFailure, type FailureCode } from "./provider-errors.js";

export const connectionNames = ["slack-search", "notion", "granola", "google-calendar", "github", "agentmail"] as const;

export function connectionRecovery(name: CheckName, code?: FailureCode): string {
  if (!code) return "A read succeeded at the checked time. This does not prove access to every record or write capability.";
  const personal = name === "slack-search";
  switch (code) {
    case "authorization_required": case "authorization_denied":
      return personal ? "Authorize your own Slack account when you next request Slack retrieval. If you declined, reconnect only when you choose to try again."
        : "An administrator must authorize the designated shared V1 account. Personal service OAuth is not required from the requester.";
    case "wrong_account": return "Use reconnect_slack with your own account in the V1 workspace. No shared grant will be substituted.";
    case "missing_scope": return personal ? "Reconnect public Slack access to request the required scopes. Private consent is requested separately, only in your DM with Vee."
      : "An administrator must grant the required scopes on the designated shared account.";
    case "provider_configuration": return "An administrator must check the connector, provider app settings, advertised tools, and enabled APIs.";
    case "connected_search_enabled": return "An administrator must disable Notion connected-source AI search server-side. Direct Notion page reads may still work.";
    case "rate_limited": return "The provider rate-limited this check. Wait before explicitly checking again.";
    case "provider_unavailable": return "The provider could not be reached after bounded read retries. Check again when service recovers.";
    case "request_cancelled": return "The check was cancelled or reached its deadline. No successful retrieval is established.";
    case "private_session_restricted": return "Check shared services in a separate conversation. This DM session has requested private Slack context.";
    default: return "This check did not establish access. Give an administrator the provider name, failed stage, and safe error code.";
  }
}

function project(report: ConnectionCheck) {
  return { name: report.name, credential: report.credential, identity: report.identity,
    handshake: report.handshake, retrieval: report.retrieval,
    ...(report.failure ? { failure: { stage: report.failure.stage, code: report.failure.code } } : {}),
    recovery: connectionRecovery(report.name, report.failure?.code) };
}

/** The caller selects services, never credential subjects, destinations, or queries. */
export async function checkConnections(names: CheckName[] | undefined, ctx: ToolContext, probe = checkConnection) {
  const caller = slackCaller(ctx);
  const selected = [...new Set(names ?? connectionNames)];
  if (!selected.length || selected.some((name) => !connectionNames.includes(name))) throw new ProviderFailure("invalid_request");
  const reports: ReturnType<typeof project>[] = [];
  // At most two providers in flight. No loops or background health checks.
  for (let offset = 0; offset < selected.length; offset += 2) {
    ctx.abortSignal?.throwIfAborted();
    reports.push(...await Promise.all(selected.slice(offset, offset + 2).map(async (name) => {
      if (name !== "slack-search" && privateSlackSession.get()) return project({ name, credential: "unavailable", identity: "not_checked", handshake: "not_checked", retrieval: "not_checked", failure: { stage: "credential", code: "private_session_restricted" } });
      try { return project(await probe(name, name === "slack-search" ? caller.userId : undefined, undefined, ctx.abortSignal)); }
      catch (error) { return project({ name, credential: "unavailable", identity: "not_checked", handshake: "not_checked", retrieval: "not_checked", failure: { stage: "credential", code: classifyFailure(error).code } }); }
    })));
  }
  return {
    checkedAt: new Date().toISOString(), reports,
    writeJournal: { configuration: process.env.VEE_ACTION_REDIS_REST_URL && process.env.VEE_ACTION_REDIS_REST_TOKEN ? "present" : "missing", connectivity: "not_checked" },
    note: "Read-only, on-demand provider checks. No consent flow is started and no private scope is requested. Slack is checked for the current requester only. The write journal is never modified by this check. Configuration presence is not a successful journal access test.",
  };
}
