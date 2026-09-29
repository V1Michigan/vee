import type { SlackChannelEvents, SlackPostInput } from "eve/channels/slack";
import { ProviderFailure } from "./provider-errors.js";
import { slackCaller } from "./slack-policy.js";

type InputRequest = Parameters<NonNullable<SlackChannelEvents["input.requested"]>>[0]["requests"][number];

function sections(text: string): unknown[] {
  const characters = Array.from(text);
  const blocks: unknown[] = [];
  for (let offset = 0; offset < characters.length; offset += 2_500) blocks.push({ type: "section", text: { type: "plain_text", text: characters.slice(offset, offset + 2_500).join("") } });
  return blocks;
}

/** All exact arguments are delivered before the approval buttons. No truncation. */
export function approvalReviewPosts(request: InputRequest, userId: string): SlackPostInput[] {
  const isApproval = request.display === "confirmation" && request.options?.some((option) => option.id === "approve");
  const blocks: unknown[] = sections(request.prompt);
  if (isApproval) {
    let input = JSON.stringify(request.action.input, null, 2);
    if (input.length > 64_000) input = JSON.stringify(request.action.input);
    if (input.length > 40_000) throw new ProviderFailure("invalid_request");
    blocks.push(...sections(`Exact action: ${request.action.toolName}\n${input}`));
    const args = request.action.input.arguments as Record<string, unknown> | undefined;
    if (request.action.input.service === "github" && request.action.input.tool === "create_or_update_file" && typeof args?.content === "string") {
      blocks.push(...sections(`Decoded file content for review:\n${Buffer.from(args.content, "base64").toString("utf8")}`));
    }
  }
  const posts: SlackPostInput[] = [];
  // Leave the buttons for the final post even when a code change needs several.
  for (let offset = 0; offset < blocks.length; offset += 8) posts.push({ blocks: blocks.slice(offset, offset + 8), text: isApproval ? "Review the exact proposed action." : request.prompt.slice(0, 2_000) });
  const options = request.options ?? [];
  const buttons: unknown[] = [];
  for (let offset = 0; offset < options.length; offset += 5) buttons.push({
    type: "actions", elements: options.slice(offset, offset + 5).map((option, index) => ({
      type: "button", action_id: `eve_input:${request.requestId}:button:${offset + index}`, value: option.id,
      text: { type: "plain_text", text: option.label.slice(0, 75) },
      ...(option.id === "approve" ? { style: "primary" } : {}),
    })),
  });
  if (request.allowFreeform || options.length === 0) buttons.push({ type: "section", text: { type: "plain_text", text: "Reply in this thread with your answer." } });
  if (buttons.length) posts.push({
    text: isApproval ? `Only ${userId} may approve this exact action.` : "Choose an option or reply in this thread.",
    blocks: [...(isApproval ? [{ type: "section", text: { type: "mrkdwn", text: `Only <@${userId}> may approve the exact action shown above.` } }] : []), ...buttons],
  });
  return posts;
}

export const reviewInputRequests: NonNullable<SlackChannelEvents["input.requested"]> = async (event, channel, ctx) => {
  const caller = slackCaller(ctx);
  for (const request of event.requests) {
    for (const post of approvalReviewPosts(request, caller.userId)) await channel.thread.post(post);
  }
};
