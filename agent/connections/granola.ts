import { connect } from "@vercel/connect/eve";
import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://mcp.granola.ai/mcp",
  description:
    "Search and read the current user's Granola meeting notes, summaries, folders, action items, and transcripts.",
  auth: connect({
    connector: "mcp.granola.ai/granola",
    principalType: "user",
    validate: true,
    instructions:
      "Authorize Vee with your Granola account. Granola controls access using your active workspace and note permissions.",
  }),
});
