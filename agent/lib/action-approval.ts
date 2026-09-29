import { createHash } from "node:crypto";
import { defineState, type StateHandle } from "eve/context";
import type { ApprovalContext, ApprovalStatus, ToolContext } from "eve/tools";
import { ProviderFailure } from "./provider-errors.js";
import { slackCaller } from "./slack-policy.js";
import { assertTeamCall, type TeamCall } from "./team-services.js";
import { assertNoPrivateSlackExport } from "./private-session.js";

type Binding = { owner: string; digest: string; toolName: string };
export type ApprovalBindings = Record<string, Binding>;
export const actionApprovals = defineState<ApprovalBindings>("vee.action-approvals.v1", () => ({}));

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function actionDigest(input: TeamCall): string {
  return createHash("sha256").update(canonical(input)).digest("hex");
}

function bindingFor(input: TeamCall, ctx: ApprovalContext | ToolContext): Binding {
  const caller = slackCaller(ctx);
  return { owner: `${caller.issuer}/${caller.principalId}/${caller.channelId}`, digest: actionDigest(input), toolName: ctx.toolName };
}

export function approveTeamAction(ctx: ApprovalContext<TeamCall>, state: StateHandle<ApprovalBindings> = actionApprovals): ApprovalStatus {
  const input = ctx.toolInput as TeamCall | undefined;
  if (!input) return { type: "denied", reason: "An exact action is required." };
  try {
    assertNoPrivateSlackExport();
    const kind = assertTeamCall(input, "action");
    const binding = bindingFor(input, ctx);
    const previous = state.get()[ctx.callId];
    if (previous && canonical(previous) !== canonical(binding)) return { type: "denied", reason: "Requester or arguments changed. Propose a new action for fresh approval." };
    state.update((values) => ({ ...Object.fromEntries(Object.entries(values).slice(-99)), [ctx.callId]: binding }));
    // Draft preparation is the one existing no-approval exception.
    return kind === "draft" ? "not-applicable" : "user-approval";
  } catch {
    return { type: "denied", reason: "This action is outside Vee's permitted tools or resources." };
  }
}

export function assertApprovedAction(input: TeamCall, ctx: ToolContext, state: StateHandle<ApprovalBindings> = actionApprovals): void {
  const previous = state.get()[ctx.callId];
  if (!previous || canonical(previous) !== canonical(bindingFor(input, ctx))) throw new ProviderFailure("access_denied");
  assertTeamCall(input, "action");
}
