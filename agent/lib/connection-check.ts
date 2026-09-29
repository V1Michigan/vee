import { getTokenResponse, type ConnectTokenParams } from "@vercel/connect";
import { sharedConnections, type SharedConnectionName } from "./shared-auth.js";
import { publicSlackScopes, SLACK_MCP_URL, SLACK_SEARCH_CONNECTOR, verifySlackAccount } from "./slack-auth.js";
import { V1_SLACK_TEAM_ID } from "./slack-policy.js";
import { teamServices } from "./team-services.js";
import { assertNotionSearchIsolation, listProviderTools } from "./team-tools.js";
import { assertMcpResult, retryRead, withMcpClient } from "./provider-client.js";
import { classifyFailure, ProviderFailure, type FailureCode } from "./provider-errors.js";

export type CheckName = SharedConnectionName | "slack-search";
type Stage = "credential" | "identity" | "handshake" | "retrieval";
export type ConnectionCheck = {
  name: CheckName; credential: "available" | "unavailable";
  identity: "not_checked" | "verified"; handshake: "not_checked" | "verified"; retrieval: "not_checked" | "verified";
  failure?: { stage: Stage; code: FailureCode };
};

const probes: Record<SharedConnectionName, { name: string; arguments: Record<string, unknown> }> = {
  agentmail: { name: "list_inboxes", arguments: { limit: 10 } },
  github: { name: "get_file_contents", arguments: { owner: "V1Michigan", repo: "vee", path: "README.md", ref: "refs/heads/main" } },
  notion: { name: "notion-search", arguments: { query: "V1", query_type: "internal" } },
  "google-calendar": { name: "list_calendars", arguments: {} },
  granola: { name: "list_meetings", arguments: {} },
};

export function slackCheckGrant(userId: string): { connector: string; params: ConnectTokenParams } {
  if (!/^[UW][A-Z0-9]+$/.test(userId)) throw new ProviderFailure("invalid_request");
  const teamId = process.env.VEE_SLACK_TEAM_ID ?? V1_SLACK_TEAM_ID;
  return { connector: SLACK_SEARCH_CONNECTOR, params: { subject: { type: "user", id: `slack:${teamId}:${userId}`, issuer: `slack:${teamId}` }, scopes: publicSlackScopes } };
}

/** Read-only checks. Tokens and retrieved content are deliberately not returned. */
export async function checkConnection(name: CheckName, slackUser?: string, tokenProvider = getTokenResponse): Promise<ConnectionCheck> {
  const report: ConnectionCheck = { name, credential: "unavailable", identity: "not_checked", handshake: "not_checked", retrieval: "not_checked" };
  let stage: Stage = "credential";
  try {
    const grant = name === "slack-search" ? slackCheckGrant(slackUser ?? "") : (() => {
      if (!Object.hasOwn(sharedConnections, name)) throw new ProviderFailure("invalid_request");
      const { connector, ...params } = sharedConnections[name];
      return { connector, params };
    })();
    const { token } = await tokenProvider(grant.connector, grant.params, { forceRefresh: true });
    report.credential = "available";
    const signal = AbortSignal.timeout(60_000);
    if (name === "slack-search") {
      stage = "identity";
      await verifySlackAccount(token, { teamId: process.env.VEE_SLACK_TEAM_ID ?? V1_SLACK_TEAM_ID, userId: slackUser! }, signal);
      report.identity = "verified";
    }
    const url = name === "slack-search" ? SLACK_MCP_URL : teamServices[name].url;
    const probe = name === "slack-search" ? { name: "slack_search_public", arguments: {
      keywords: ["V1"], content_types: "messages", include_bots: true, include_context: false, limit: 1, response_format: "detailed",
    } } : probes[name];
    await retryRead(() => {
      stage = "handshake";
      return withMcpClient(url, token, signal, async (client) => {
      report.handshake = "verified";
      stage = "retrieval";
      const tools = await listProviderTools(client, signal);
      if (!tools.some((tool) => tool.name === probe.name)) throw new ProviderFailure("provider_configuration");
      if (name === "notion") assertNotionSearchIsolation(tools);
      const result = await client.callTool({ ...probe, options: { signal, timeout: 15_000 } });
      assertMcpResult(result);
      report.retrieval = "verified";
      });
    }, signal);
  } catch (error) {
    report.failure = { stage, code: classifyFailure(error).code };
  }
  return report;
}

export function formatConnectionCheck(report: ConnectionCheck): string {
  const stages = `credential=${report.credential}, identity=${report.identity}, mcp=${report.handshake}, retrieval=${report.retrieval}`;
  return `${report.name}: ${stages}${report.failure ? `; ${report.failure.stage}: ${report.failure.code}` : ""}`;
}
