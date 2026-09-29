import { defineTool } from "eve/tools";
import { z } from "zod";
import { retrieveSlack } from "../lib/slack-retrieval.js";

export default defineTool({
  description: "Read a Slack channel or thread discovered during search. Runtime checks verify the channel's visibility before retrieving content. Private-channel reads are allowed only in the requester's personal DM with Vee. Existing personal or group DM history is excluded. Use nextCursor for additional pages.",
  inputSchema: z.object({
    scope: z.enum(["public", "private"]).default("public"),
    channelId: z.string().regex(/^[CG][A-Z0-9]+$/),
    threadTs: z.string().regex(/^\d+\.\d+$/).optional(),
    cursor: z.string().min(1).max(2_000).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }).strict(),
  execute: retrieveSlack,
});
