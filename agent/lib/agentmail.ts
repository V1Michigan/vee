import { connect } from "@vercel/connect/eve";

export const AGENTMAIL_MCP_URL = "https://mcp.agentmail.to/mcp";

export const agentMailAuth = connect({
  connector: "mcp.agentmail.to/vee",
  principalType: "user",
  createSubject: () => ({
    type: "user" as const,
    id: "vee-shared-agentmail-v1",
  }),
  validate: true,
  instructions:
    "Authorize Vee's AgentMail organization and inbox. Vee must ask for confirmation immediately before creating or deleting mailboxes, sending, replying, forwarding, or sending drafts. Reading messages and creating or editing drafts is allowed without confirmation.",
});
