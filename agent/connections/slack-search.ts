import { connect } from "@vercel/connect/eve";
import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://mcp.slack.com/mcp",
  description:
    "Search public Slack channels for messages, decisions, discussions, and team context visible in the V1 workspace.",
  auth: connect({
    connector: "slack/vee",
    principalType: "user",
    tokenParams: {
      scopes: ["search:read.public"],
    },
    validate: true,
    instructions:
      "Authorize Vee to search public channels in Slack on your behalf. Private channels and direct messages are not requested.",
  }),
});
