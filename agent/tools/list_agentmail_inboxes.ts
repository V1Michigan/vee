import { createMCPClient, UnauthorizedError } from "@ai-sdk/mcp";
import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  AGENTMAIL_MCP_URL,
  agentMailAuth,
} from "../lib/agentmail.js";
import {
  agentMailInboxListArguments,
  normalizeAgentMailInboxList,
} from "../lib/agentmail-list.js";

const inboxSchema = z.object({
  inboxId: z.string(),
  email: z.string(),
  displayName: z.string().optional(),
  metadata: z.unknown().optional(),
  updatedAt: z.string(),
  createdAt: z.string(),
});

const outputSchema = z.object({
  count: z.number(),
  limit: z.number(),
  nextPageToken: z.string().optional(),
  inboxes: z.array(inboxSchema),
});

const authOptions = {
  authKey: "agentmail",
  displayName: "AgentMail",
  connection: { url: AGENTMAIL_MCP_URL },
} as const;

export default defineTool({
  description:
    "List Vee's AgentMail inboxes. Use this for natural requests such as 'list AgentMail inboxes'. Pagination is handled safely and no input is required.",
  inputSchema: z.object({}),
  outputSchema,
  async execute(_input, ctx) {
    const { token } = await ctx.getToken(agentMailAuth, authOptions);
    let client;

    try {
      client = await createMCPClient({
        transport: {
          type: "http",
          url: AGENTMAIL_MCP_URL,
          headers: { Authorization: `Bearer ${token}` },
        },
      });

      const result = await client.callTool({
        name: "list_inboxes",
        arguments: agentMailInboxListArguments(),
        options: { signal: ctx.abortSignal },
      });

      return outputSchema.parse(normalizeAgentMailInboxList(result));
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        ctx.requireAuth(agentMailAuth, authOptions);
      }
      throw error;
    } finally {
      await client?.close();
    }
  },
});
