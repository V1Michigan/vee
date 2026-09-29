import { defineTool } from "eve/tools";
import { z } from "zod";
import { retrieveSlack } from "../lib/slack-retrieval.js";

export default defineTool({
  description: "Search Slack on behalf of the current requester. Public search works in shared conversations. Private-channel search requires opt-in authorization and the requester's personal DM with Vee. Personal DM history is never searched. Use focused keywords and Slack filters, then read relevant threads. Integration messages, including Tally confirmations, are included. Results are not an exhaustive dataset.",
  inputSchema: z.object({
    scope: z.enum(["public", "private"]).default("public"),
    keywords: z.array(z.string().max(120).regex(/^(?:\S+|"[^"\n]+")$/)).max(12).optional(),
    filters: z.string().max(1_000).optional(),
    question: z.string().max(1_000).optional(),
    cursor: z.string().min(1).max(2_000).optional(),
    limit: z.number().int().min(1).max(20).default(10),
    sort: z.enum(["score", "timestamp"]).default("score"),
  }).strict(),
  execute: retrieveSlack,
});
