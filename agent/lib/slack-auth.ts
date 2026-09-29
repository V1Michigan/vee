import { connect } from "@vercel/connect/eve";
import { ConnectionAuthorizationFailedError, ConnectionAuthorizationRequiredError } from "eve/connections";
import type { SlackAccess, SlackCaller } from "./slack-policy.js";
import { classifyFailure, ProviderFailure } from "./provider-errors.js";
import { providerFetch, retryRead } from "./provider-client.js";

export const SLACK_MCP_URL = "https://mcp.slack.com/mcp";
export const SLACK_SEARCH_CONNECTOR = process.env.SLACK_SEARCH_CONNECTOR ?? "slack/vee";
export const publicSlackScopes = ["search:read.public", "channels:read", "channels:history"];
export const privateSlackScopes = [...publicSlackScopes, "search:read.private", "groups:read", "groups:history"];

export function slackAuth(access: SlackAccess) {
  return connect({
    connector: SLACK_SEARCH_CONNECTOR,
    principalType: "user",
    validate: true,
    tokenParams: { scopes: access === "private" ? privateSlackScopes : publicSlackScopes },
    instructions: access === "private"
      ? "Authorize Vee to search your private channels in this DM. Use your own account in V1 Team. Personal DM history is not requested."
      : "Authorize Slack search with your own account in V1 Team. This initially requests public-channel access only.",
    onError(error, phase) {
      const failure = classifyFailure(error);
      // Preserve Eve's interactive park/resume semantics without forwarding
      // raw Connect messages into the durable stream or diagnostics.
      if (failure.code === "authorization_required" && phase === "getToken") return new ConnectionAuthorizationRequiredError("slack-search", { message: failure.message });
      return new ConnectionAuthorizationFailedError("slack-search", {
        reason: failure.code, retryable: false, message: failure.message,
      });
    },
  });
}

export const slackPublicAuth = slackAuth("public");
export const slackPrivateAuth = slackAuth("private");
export const slackAuthOptions = (access: SlackAccess) => ({
  authKey: access === "private" ? "slack-search-private" : "slack-search",
  displayName: access === "private" ? "Slack private channels" : "Slack public channels",
  connection: { url: SLACK_MCP_URL },
});

export async function slackApiRead(token: string, method: "auth.test" | "conversations.info", args: Record<string, string>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  return retryRead(async () => {
    const response = await providerFetch(signal)(`https://slack.com/api/${method}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(args),
    });
    if (response.status === 401) throw new ProviderFailure("authorization_required");
    const body = await response.json() as Record<string, unknown>;
    if (body.ok !== true) throw classifyFailure({ message: body.error });
    return body;
  }, signal);
}

export async function verifySlackAccount(token: string, caller: Pick<SlackCaller, "teamId" | "userId">, signal?: AbortSignal): Promise<void> {
  const identity = await slackApiRead(token, "auth.test", {}, signal);
  if (identity.team_id !== caller.teamId || identity.user_id !== caller.userId || identity.bot_id) {
    throw new ProviderFailure("wrong_account");
  }
}
