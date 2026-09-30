import { connectSlackCredentials } from "@vercel/connect/eve";
import { slackChannel } from "eve/channels/slack";
import { slackInbound } from "../lib/slack-inbound.js";
import { reviewInputRequests } from "../lib/approval-review.js";

// Vercel sets SLACK_CONNECTOR when the Slack connector is provisioned.
export default slackChannel({
  credentials: connectSlackCredentials(process.env.SLACK_CONNECTOR ?? "slack/v1-ops"),
  threadContext: { since: "last-agent-reply" },
  onAppMention: (ctx, message) => slackInbound(ctx, message, "shared"),
  onDirectMessage: (ctx, message) => slackInbound(ctx, message, "dm"),
  events: {
    "input.requested": reviewInputRequests,
    "reasoning.appended": () => {},
    "actions.requested": async (_event, channel) => { await channel.thread.startTyping("Working…"); },
  },
});
