import { defineMcpClientConnection } from "eve/connections";
import { AGENTMAIL_MCP_URL, agentMailAuth } from "../lib/agentmail.js";

const allowedTools = [
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
  url: AGENTMAIL_MCP_URL,
  description:
    "Vee's AgentMail inbox for reading, drafting, and sending email on behalf of V1 at Michigan. Use Vee's dedicated list_agentmail_inboxes tool to list inboxes. For list_messages and search_messages, omit every unused optional argument; never send empty strings or empty arrays for before, after, pageToken, labels, from, to, or subject.",
  tools: { allow: allowedTools },
  auth: agentMailAuth,
});
