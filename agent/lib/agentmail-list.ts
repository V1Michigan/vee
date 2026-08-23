import type { CallToolResult } from "@ai-sdk/mcp";

export type AgentMailInbox = {
  inboxId: string;
  email: string;
  displayName?: string;
  metadata?: unknown;
  updatedAt: string;
  createdAt: string;
};

export type AgentMailInboxList = {
  count: number;
  limit: number;
  nextPageToken?: string;
  inboxes: AgentMailInbox[];
};

export function agentMailInboxListArguments(): { limit: 10 } {
  return { limit: 10 };
}

function errorText(result: Extract<CallToolResult, { content: unknown }>): string {
  return result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

export function normalizeAgentMailInboxList(
  result: CallToolResult,
): AgentMailInboxList {
  if ("toolResult" in result) {
    return result.toolResult as AgentMailInboxList;
  }

  const text = errorText(result);
  if (result.isError) {
    throw new Error(text || "AgentMail could not list inboxes.");
  }

  if (result.structuredContent !== undefined) {
    return result.structuredContent as AgentMailInboxList;
  }

  if (!text) {
    throw new Error("AgentMail returned an empty inbox-list response.");
  }

  try {
    return JSON.parse(text) as AgentMailInboxList;
  } catch (error) {
    throw new Error("AgentMail returned an invalid inbox-list response.", {
      cause: error,
    });
  }
}
