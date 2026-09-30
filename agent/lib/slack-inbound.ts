import { defaultSlackAuth, type SlackContext, type SlackMessage } from "eve/channels/slack";
import { chooseModelRoute } from "./model-routing.js";
import { slackRolloutAllows, V1_SLACK_TEAM_ID } from "./slack-policy.js";

export function slackInbound(ctx: SlackContext, message: SlackMessage, surface: "dm" | "shared") {
  if (message.teamId !== (process.env.VEE_SLACK_TEAM_ID ?? V1_SLACK_TEAM_ID) || !message.author || message.author.isBot) return null;
  if (!slackRolloutAllows(message.author.userId)) return null;
  const auth = defaultSlackAuth(message, ctx);
  if (!auth) return null;
  // Only the signed triggering message can choose a route. Thread history,
  // attachments, tool output and quoted messages never enter this classifier.
  const route = chooseModelRoute(message.text, process.env.VEE_MODEL_ROUTING ?? "auto");
  return { auth: { ...auth, attributes: {
    ...auth.attributes, vee_surface: surface,
    vee_route_profile: route.profile, vee_route_reason: route.reason, vee_route_policy: route.policyVersion,
  } } };
}
