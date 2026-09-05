import { sharedAuth } from "../lib/shared-auth.js";
import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://mcp.slack.com/mcp",
  description:
    "Search public Slack channels for messages, decisions, discussions, and team context visible in the V1 workspace.",
  auth: sharedAuth("slack-search"),
});
