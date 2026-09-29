import { defineTool } from "eve/tools";
import { z } from "zod";
import { reconnectSlack } from "../lib/slack-reconnect.js";

export default defineTool({
  description: "Start a fresh personal Slack sign-in when the requester asks to reconnect or correct a wrong-account or missing-scope authorization. Private-channel permission is available only in the requester's DM. Consent must use that person's V1 Slack account. This never changes the retained shared grant.",
  inputSchema: z.object({ scope: z.enum(["public", "private"]).default("public") }).strict(),
  execute: (input, ctx) => reconnectSlack(input.scope, ctx),
});
