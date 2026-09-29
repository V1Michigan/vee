import { defineState } from "eve/context";
import type { ToolContext } from "eve/tools";
import { slackCaller, type SlackAccess } from "./slack-policy.js";
import { slackAuthOptions, slackPrivateAuth, slackPublicAuth, verifySlackAccount } from "./slack-auth.js";
import { ProviderFailure } from "./provider-errors.js";
import { privateSlackSession } from "./private-session.js";

export const reconnectRequests = defineState<Record<string, string>>("vee.slack-reconnect.v1", () => ({}));

export async function reconnectSlack(scope: SlackAccess, ctx: ToolContext) {
  const caller = slackCaller(ctx, scope);
  if (scope === "private") privateSlackSession.update(() => true);
  const auth = scope === "private" ? slackPrivateAuth : slackPublicAuth;
  const options = slackAuthOptions(scope);
  const binding = `${caller.principalId}/${caller.channelId}/${scope}`;
  const previous = reconnectRequests.get()[ctx.callId];
  if (previous && previous !== binding) throw new ProviderFailure("access_denied");
  if (!previous) {
    reconnectRequests.update((state) => ({ ...Object.fromEntries(Object.entries(state).slice(-39)), [ctx.callId]: binding }));
    ctx.requireAuth(auth, options);
  }
  // On OAuth resume the same call checks the new credential instead of starting
  // consent repeatedly. No shared identity or other user's grant is consulted.
  const { token } = await ctx.getToken(auth, options);
  await verifySlackAccount(token, caller, ctx.abortSignal);
  return { account: "verified_requester", scope, note: "The Slack account matches. Run the requested retrieval to verify provider access." };
}
