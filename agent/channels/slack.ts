import { connectSlackCredentials } from "@vercel/connect/eve";
import { slackChannel } from "eve/channels/slack";

// Vercel sets SLACK_CONNECTOR when the Slack connector is provisioned.
export default slackChannel({
  credentials: connectSlackCredentials(process.env.SLACK_CONNECTOR ?? "slack/v1-ops"),
  threadContext: { since: "last-agent-reply" },
});
