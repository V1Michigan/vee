import { defineTool } from "eve/tools";
import { z } from "zod";
import { checkConnections, connectionNames } from "../lib/connection-status.js";

export default defineTool({
  description: "Check which Vee connections actually work right now, including credentials, Slack identity, MCP handshake, and a bounded provider read. Use for connection status or diagnostics, not as a pre-search on every turn. Omit services to check all; select one for a focused check. Never starts sign-in or checks another user's Slack grant.",
  inputSchema: z.object({ services: z.array(z.enum(connectionNames)).min(1).max(6).optional() }).strict(),
  execute: ({ services }, ctx) => checkConnections(services, ctx),
});
