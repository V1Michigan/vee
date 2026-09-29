import type { CallToolResult } from "@ai-sdk/mcp";
import type { ToolContext } from "eve/tools";
import { callMcpRead, mcpText } from "./provider-client.js";
import { classifyFailure, ProviderFailure } from "./provider-errors.js";
import { assertReadableChannel, slackCaller, type SlackAccess } from "./slack-policy.js";
import { SLACK_MCP_URL, slackAuthOptions, slackPublicAuth, slackPrivateAuth, slackApiRead, verifySlackAccount } from "./slack-auth.js";

export type SlackSearchInput = {
  scope: SlackAccess; keywords?: string[]; filters?: string; question?: string;
  cursor?: string; limit: number; sort: "score" | "timestamp";
};
export type SlackReadInput = { scope: SlackAccess; channelId: string; threadTs?: string; cursor?: string; limit: number };

export function searchArguments(input: SlackSearchInput): Record<string, unknown> {
  if (!input.keywords?.length && !input.filters?.trim()) throw new ProviderFailure("invalid_request");
  if (/\bin:\s*@|\bis:\s*(?:dm|im|mpim)\b|\bin:\s*<?[DUW][A-Z0-9]+/i.test(input.filters ?? "")) throw new ProviderFailure("access_denied");
  return {
    ...(input.keywords?.length ? { keywords: input.keywords } : {}),
    ...(input.filters ? { filters: input.filters } : {}),
    ...(input.cursor ? { cursor: input.cursor } : {}),
    natural_language_query: input.question ?? "",
    content_types: "messages",
    ...(input.scope === "private" ? { channel_types: "private_channel" } : {}),
    include_bots: true, include_context: true, max_context_length: 800,
    limit: input.limit, sort: input.sort, response_format: "detailed",
  };
}

/** Bound content before it enters Eve's durable result stream, not only the model projection. */
export function slackResult(result: CallToolResult) {
  let data: unknown = "structuredContent" in result ? result.structuredContent : undefined;
  let raw = mcpText(result);
  if (!data) { try { data = JSON.parse(raw); } catch { /* A text response is also valid MCP. */ } }
  if (data && typeof data === "object") {
    const structured = data as Record<string, unknown>;
    raw = typeof structured.results === "string" ? structured.results : JSON.stringify(data);
  }
  // Author email addresses are unnecessary for citing Slack conversations.
  raw = raw.replace(/<[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}>/gi, "");
  const metadata = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const pagination = typeof metadata.pagination_info === "string" ? metadata.pagination_info : "";
  const nextCursor = typeof metadata.next_cursor === "string" ? metadata.next_cursor
    : /cursor\s+`([^`]+)`/.exec(pagination)?.[1];
  const citations = [...new Set(raw.match(/https:\/\/[a-z0-9-]+\.slack\.com\/archives\/[A-Z0-9]+\/p[0-9]+(?:\?[^\s)"<>\\]+)?/g) ?? [])].slice(0, 20);
  return {
    source: "Slack", text: raw.slice(0, 24_000), citations,
    ...(nextCursor ? { nextCursor } : {}), truncated: raw.length > 24_000,
    coverage: "retrieved_subset",
    note: "These are retrieved messages, not proof of a complete roster or all matching records. Follow cursors and source records when completeness matters.",
  };
}

export async function retrieveSlack(input: SlackSearchInput | SlackReadInput, ctx: ToolContext) {
  const caller = slackCaller(ctx, input.scope);
  // Validate and fix search scope before obtaining any credential.
  const args = "channelId" in input ? undefined : searchArguments(input);
  const auth = input.scope === "private" ? slackPrivateAuth : slackPublicAuth;
  const options = slackAuthOptions(input.scope);
  const { token } = await ctx.getToken(auth, options);
  try {
    await verifySlackAccount(token, caller, ctx.abortSignal);
    let result: CallToolResult;
    if ("channelId" in input) {
      // A channel id's prefix alone cannot establish its visibility.
      if (!/^[CG][A-Z0-9]+$/.test(input.channelId)) throw new ProviderFailure("access_denied");
      const info = await slackApiRead(token, "conversations.info", { channel: input.channelId }, ctx.abortSignal);
      if (!info.channel || typeof info.channel !== "object") throw new ProviderFailure("access_denied");
      assertReadableChannel(info.channel as Record<string, unknown>, input.scope);
      result = await callMcpRead(SLACK_MCP_URL, token, input.threadTs ? "slack_read_thread" : "slack_read_channel", {
        channel_id: input.channelId, ...(input.threadTs ? { message_ts: input.threadTs } : {}),
        ...(input.cursor ? { cursor: input.cursor } : {}), limit: input.limit, response_format: "detailed",
      }, ctx.abortSignal);
    } else {
      result = await callMcpRead(SLACK_MCP_URL, token,
        input.scope === "private" ? "slack_search_public_and_private" : "slack_search_public", args!, ctx.abortSignal,
        input.scope === "private" ? ["channel_types"] : []);
    }
    return slackResult(result);
  } catch (error) {
    const failure = classifyFailure(error);
    if (failure.code === "authorization_required") ctx.requireAuth(auth, options);
    throw failure;
  }
}
