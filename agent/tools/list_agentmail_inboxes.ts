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
import { callMcpRead } from "../lib/provider-client.js";
import { classifyFailure } from "../lib/provider-errors.js";
import { slackCaller } from "../lib/slack-policy.js";
import { assertNoPrivateSlackExport } from "../lib/private-session.js";

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
    "List the first page of Vee's AgentMail inboxes, with up to 10 inboxes. Report a nextPageToken as incomplete coverage. No input is required.",
  inputSchema: z.object({}),
  outputSchema,
  async execute(_input, ctx) {
    slackCaller(ctx);
    assertNoPrivateSlackExport();
    const { token } = await ctx.getToken(agentMailAuth, authOptions);
    try {
      const result = await callMcpRead(AGENTMAIL_MCP_URL, token, "list_inboxes", agentMailInboxListArguments(), ctx.abortSignal);
      return outputSchema.parse(normalizeAgentMailInboxList(result));
    } catch (error) {
      throw classifyFailure(error);
    }
  },
});
