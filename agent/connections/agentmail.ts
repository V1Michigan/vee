import { connect } from "@vercel/connect/eve";
import { defineMcpClientConnection } from "eve/connections";

const allowedTools = [
  "list_inboxes",
  "get_inbox",
  "create_inbox",
  "list_messages",
  "search_messages",
  "get_thread",
  "create_draft",
  "list_drafts",
  "get_draft",
  "update_draft",
  "send_draft",
  "send_message",
  "reply_to_message",
  "forward_message",
  "update_message",
];

export default defineMcpClientConnection({
  url: "https://mcp.agentmail.to/mcp",
  description:
    "Vee's AgentMail inbox for reading, drafting, and sending email on behalf of V1 at Michigan.",
  tools: { allow: allowedTools },
  auth: connect({
    connector: "mcp.agentmail.to/vee",
    principalType: "user",
    createSubject: () => ({
      type: "user" as const,
      id: "vee-shared-agentmail-v1",
    }),
    validate: true,
    instructions:
      "Authorize Vee's AgentMail organization and inbox. Vee must ask for confirmation immediately before creating or deleting mailboxes, sending, replying, forwarding, or sending drafts. Reading messages and creating or editing drafts is allowed without confirmation.",
  }),
});
