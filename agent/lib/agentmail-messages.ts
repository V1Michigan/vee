import type { CallToolResult } from "@ai-sdk/mcp";
import { sanitizeAgentMailArguments } from "./agentmail-sanitize.js";

export type AgentMailMessage = {
  inboxId: string;
  threadId: string;
  messageId: string;
  labels: string[];
  timestamp: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  preview?: string;
  size: number;
  updatedAt: string;
  createdAt: string;
  attachments?: {
    attachmentId: string;
    filename?: string;
    size: number;
    contentType?: string;
    contentDisposition?: string;
    contentId?: string;
  }[];
  inReplyTo?: string;
  references?: string[];
  highlights?: Record<string, string[]>;
};

export type AgentMailMessageList = {
  count: number;
  limit: number;
  nextPageToken?: string;
  messages: AgentMailMessage[];
};

export type AgentMailMessageListInput = {
  inboxId: string;
  limit?: number;
  pageToken?: string;
  labels?: string[];
  before?: string;
  after?: string;
  ascending?: boolean;
  from?: string[];
  to?: string[];
  subject?: string[];
  includeSpam?: boolean;
  includeTrash?: boolean;
};

export type AgentMailMessageSearchInput = {
  inboxId: string;
  q: string;
  limit?: number;
  pageToken?: string;
  before?: string;
  after?: string;
};

export function agentMailMessageListArguments(
  input: AgentMailMessageListInput,
): Record<string, unknown> {
  return sanitizeAgentMailArguments({ limit: 10, ...input });
}

export function agentMailMessageSearchArguments(
  input: AgentMailMessageSearchInput,
): Record<string, unknown> {
  return sanitizeAgentMailArguments({ limit: 10, ...input });
}

function errorText(result: Extract<CallToolResult, { content: unknown }>): string {
  return result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

export function normalizeAgentMailMessageList(
  result: CallToolResult,
): AgentMailMessageList {
  if ("toolResult" in result) {
    return result.toolResult as AgentMailMessageList;
  }

  const text = errorText(result);
  if (result.isError) {
    throw new Error(text || "AgentMail could not list messages.");
  }

  if (result.structuredContent !== undefined) {
    return result.structuredContent as AgentMailMessageList;
  }

  if (!text) {
    throw new Error("AgentMail returned an empty message-list response.");
  }

  try {
    return JSON.parse(text) as AgentMailMessageList;
  } catch (error) {
    throw new Error("AgentMail returned an invalid message-list response.", {
      cause: error,
    });
  }
}
