import { connectSlackCredentials } from "@vercel/connect/eve";
import { defaultSlackAuth, slackChannel, type SlackContext, type SlackMessage } from "eve/channels/slack";
import { V1_SLACK_TEAM_ID } from "../lib/slack-policy.js";
import { reviewInputRequests } from "../lib/approval-review.js";

function inbound(ctx: SlackContext, message: SlackMessage, surface: "dm" | "shared") {
  if (message.teamId !== (process.env.VEE_SLACK_TEAM_ID ?? V1_SLACK_TEAM_ID) || !message.author || message.author.isBot) return null;
  const auth = defaultSlackAuth(message, ctx);
  if (!auth) return null;
  return { auth: { ...auth, attributes: { ...auth.attributes, vee_surface: surface } } };
}

// Vercel sets SLACK_CONNECTOR when the Slack connector is provisioned.
export default slackChannel({
  credentials: connectSlackCredentials(process.env.SLACK_CONNECTOR ?? "slack/v1-ops"),
  threadContext: { since: "last-agent-reply" },
  onAppMention: (ctx, message) => inbound(ctx, message, "shared"),
  onDirectMessage: (ctx, message) => inbound(ctx, message, "dm"),
  events: {
    "input.requested": reviewInputRequests,
    "reasoning.appended": () => {},
    "actions.requested": async (_event, channel) => { await channel.thread.startTyping("Working…"); },
  },
});
