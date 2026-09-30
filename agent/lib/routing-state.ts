import { defineState } from "eve/context";
import type { DynamicResolveContext } from "eve/tools";
import { modelSelection, safeModelRoute, safeRoutingDecision, snapshotModelRoute, standardRoute, type ModelRoute } from "./model-routing.js";
import { slackCaller } from "./slack-policy.js";

type TurnRoute = { turnId: string; route: ModelRoute };
export const turnModelRoute = defineState<TurnRoute | null>("vee.turn-model-route.v1", () => null);

function routeForRequester(ctx: DynamicResolveContext): ModelRoute {
  try { slackCaller(ctx); }
  catch { return snapshotModelRoute(standardRoute("unverified_request")); }
  const mode = process.env.VEE_MODEL_ROUTING ?? "auto";
  if (mode === "off") return snapshotModelRoute(standardRoute("routing_disabled"));
  if (mode !== "auto" && mode !== "explicit") return snapshotModelRoute(standardRoute("invalid_configuration"));
  const attributes = ctx.session.auth.current!.attributes;
  let decision = safeRoutingDecision({
    profile: attributes.vee_route_profile, reason: attributes.vee_route_reason, policyVersion: attributes.vee_route_policy,
  }) ?? standardRoute("missing_request");
  if (mode === "explicit" && ["cross_source_reconciliation", "architecture_analysis"].includes(decision.reason)) decision = standardRoute();
  return snapshotModelRoute(decision);
}

export function routeForTurn(turnId: string): ModelRoute | null {
  try {
    const state = turnModelRoute.get();
    return state?.turnId === turnId ? safeModelRoute(state.route) : null;
  } catch { return null; }
}

/** Eve persists the returned selection across the turn's tool/OAuth/approval steps. */
export function resolveTurnModel(event: unknown, ctx: DynamicResolveContext) {
  const incoming = event as { type?: unknown; data?: { turnId?: unknown } } | null;
  if (incoming?.type !== "turn.started" || typeof incoming.data?.turnId !== "string" || !incoming.data.turnId) {
    return modelSelection(snapshotModelRoute(standardRoute("unverified_request")));
  }
  const turnId = incoming.data.turnId;
  try {
    const existing = routeForTurn(turnId);
    if (existing) return modelSelection(existing);
    const route = routeForRequester(ctx);
    turnModelRoute.update(() => ({ turnId, route }));
    return modelSelection(route);
  } catch {
    // Do not let a routing observer or a raw error replace the user's turn.
    // No durable decision means observability must report unknown attribution.
    console.warn("vee.routing_unavailable");
    return modelSelection(snapshotModelRoute(standardRoute()));
  }
}
