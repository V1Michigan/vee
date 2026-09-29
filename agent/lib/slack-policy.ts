import type { SessionContext } from "eve/tools";
import { ProviderFailure } from "./provider-errors.js";

export const V1_SLACK_TEAM_ID = "T02UZ8D4ZMY";
export type SlackAccess = "public" | "private";
export type SlackCaller = { teamId: string; userId: string; channelId: string; principalId: string; issuer: string; personalDm: boolean };

export function slackRolloutAllows(userId: string): boolean {
  const rollout = process.env.VEE_SLACK_ROLLOUT ?? "pilot";
  if (rollout === "enabled") return true;
  if (rollout !== "pilot") return false;
  return (process.env.VEE_SLACK_PILOT_USERS ?? "").split(",").map((value) => value.trim()).filter(Boolean).includes(userId);
}

export function slackCaller(ctx: SessionContext, access: SlackAccess = "public"): SlackCaller {
  const current = ctx.session.auth.current;
  const first = ctx.session.auth.initiator;
  const teamId = current?.attributes.team_id;
  const userId = current?.attributes.user_id;
  const channelId = current?.attributes.channel_id;
  const expectedTeam = process.env.VEE_SLACK_TEAM_ID ?? V1_SLACK_TEAM_ID;
  if (current?.authenticator !== "slack-webhook" || current.principalType !== "user"
    || teamId !== expectedTeam || typeof userId !== "string" || !/^[UW][A-Z0-9]+$/.test(userId)
    || typeof channelId !== "string" || !/^[CDG][A-Z0-9]+$/.test(channelId)
    || current.principalId !== `slack:${teamId}:${userId}` || current.issuer !== `slack:${teamId}`) {
    throw new ProviderFailure("access_denied");
  }
  // Only the verified message.im handler adds this marker. Native approval
  // callbacks may omit it, so use the pinned DM owner on those continuations.
  const personalDm = channelId.startsWith("D") && first?.attributes.vee_surface === "dm"
    && first.principalId === current.principalId
    && first.attributes.channel_id === channelId
    && first.attributes.team_id === teamId;
  if (access === "private" && !personalDm) throw new ProviderFailure("access_denied");
  if (!slackRolloutAllows(userId!)) throw new ProviderFailure("access_denied");
  return { teamId: teamId!, userId: userId!, channelId: channelId!, principalId: current.principalId, issuer: current.issuer!, personalDm };
}

export function assertReadableChannel(channel: Record<string, unknown>, access: SlackAccess): void {
  if (channel.is_im !== false || channel.is_mpim !== false
    || typeof channel.is_private !== "boolean"
    || (channel.is_channel !== true && channel.is_group !== true)
    || (channel.is_private && access !== "private")) throw new ProviderFailure("access_denied");
}
