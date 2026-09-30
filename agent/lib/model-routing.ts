export const ROUTING_POLICY_VERSION = "simple-v1";
export type ModelProfile = "standard" | "deep";
export type RoutingMode = "auto" | "explicit" | "off";
export type RouteReason = "routine_request" | "explicit_standard" | "explicit_deep"
  | "cross_source_reconciliation" | "architecture_analysis" | "routing_disabled"
  | "invalid_configuration" | "unverified_request" | "missing_request";

// Verified against the public AI Gateway catalog on 2026-09-30. Keep model
// changes in this registry reviewable; request text never supplies a model ID.
export const MODEL_PROFILES = {
  standard: { model: "openai/gpt-5.6-luna", contextWindowTokens: 1_050_000, reasoningEffort: "provider-default" },
  deep: { model: "openai/gpt-5.6-sol", contextWindowTokens: 1_050_000, reasoningEffort: "low" },
} as const;
export type RoutingDecision = {
  policyVersion: typeof ROUTING_POLICY_VERSION;
  profile: ModelProfile;
  reason: RouteReason;
};
export type ModelRoute = RoutingDecision & {
  model: typeof MODEL_PROFILES[ModelProfile]["model"];
  contextWindowTokens: number;
  reasoningEffort: "provider-default" | "low";
};

const DEEP_REASONS = new Set<RouteReason>(["explicit_deep", "cross_source_reconciliation", "architecture_analysis"]);
const STANDARD_REASONS = new Set<RouteReason>(["routine_request", "explicit_standard", "routing_disabled", "invalid_configuration", "unverified_request", "missing_request"]);

export function standardRoute(reason: Exclude<RouteReason, "explicit_deep" | "cross_source_reconciliation" | "architecture_analysis"> = "routine_request"): RoutingDecision {
  return { policyVersion: ROUTING_POLICY_VERSION, profile: "standard", reason };
}

function deepRoute(reason: "explicit_deep" | "cross_source_reconciliation" | "architecture_analysis"): RoutingDecision {
  return { policyVersion: ROUTING_POLICY_VERSION, profile: "deep", reason };
}

/** Conservative rules over the first line of the triggering request only. */
export function chooseModelRoute(text: string, mode: string = "auto"): RoutingDecision {
  if (mode === "off") return standardRoute("routing_disabled");
  if (mode !== "auto" && mode !== "explicit") return standardRoute("invalid_configuration");
  // Slack limits text length too. Bound work before applying any expressions.
  if (text.length > 40_000) return standardRoute();
  let request = text.trimStart().replace(/^<@[A-Z0-9]+>\s*[:,]?\s*/u, "").split(/\r?\n/u, 1)[0].trim();
  if (!request) return standardRoute("missing_request");
  if (request.length > 1_000 || /^(?:>|```|"|“)/u.test(request)) return standardRoute();
  request = request.replace(/^(?:(?:please|can you|could you|would you|help me)\s+)+/iu, "");
  if (/^standard\s*:\s*\S/iu.test(request)) return standardRoute("explicit_standard");
  if (/^(?:deep\s*:\s*\S|think deeply\b)/iu.test(request)) return deepRoute("explicit_deep");
  if (mode === "explicit") return standardRoute();

  // Quoted examples and link labels are evidence, not routing instructions.
  request = request.replace(/`[^`]*`|“[^”]*”|"[^"]*"|(?<!\w)'[^']*'(?!\w)|‘[^’]*’|<[^>]*>|https?:\/\/\S+/giu, " ");
  if (/^(?:reconcile|cross-check|compare|resolve)\b/iu.test(request)) {
    const sources = ["slack", "notion", "granola", "tally"].filter((source) => new RegExp(`\\b${source}\\b`, "iu").test(request));
    const records = /\b(?:events?|schedules?|companies|company|records?|tasks?|sponsors?|attendance)\b/iu.test(request);
    const conflicts = /\b(?:conflicting|inconsistent|discrepancies|disagreements?)\b/iu.test(request);
    if (records && (sources.length >= 2 || conflicts)) return deepRoute("cross_source_reconciliation");
  }
  if (/^(?:design|review|evaluate|compare)\b/iu.test(request)
    && /\b(?:architecture|architectural)\b/iu.test(request)) return deepRoute("architecture_analysis");
  return standardRoute();
}

/** Project only our enums when reading persisted or channel-supplied metadata. */
export function safeRoutingDecision(value: unknown): RoutingDecision | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.policyVersion !== ROUTING_POLICY_VERSION || typeof data.reason !== "string") return null;
  if (data.profile === "deep" && DEEP_REASONS.has(data.reason as RouteReason)) return deepRoute(data.reason as "explicit_deep" | "cross_source_reconciliation" | "architecture_analysis");
  if (data.profile === "standard" && STANDARD_REASONS.has(data.reason as RouteReason)) return standardRoute(data.reason as Parameters<typeof standardRoute>[0]);
  return null;
}

export function snapshotModelRoute(decision: RoutingDecision): ModelRoute {
  return { ...decision, ...MODEL_PROFILES[decision.profile] };
}

export function safeModelRoute(value: unknown): ModelRoute | null {
  const decision = safeRoutingDecision(value);
  if (!decision) return null;
  const data = value as Record<string, unknown>;
  const snapshot = snapshotModelRoute(decision);
  return data.model === snapshot.model && data.reasoningEffort === snapshot.reasoningEffort
    && data.contextWindowTokens === snapshot.contextWindowTokens ? snapshot : null;
}

/** Full options are returned because Eve replaces, rather than merges, them. */
export function modelSelection(route: ModelRoute) {
  return {
    model: route.model,
    modelContextWindowTokens: route.contextWindowTokens,
    modelOptions: { providerOptions: {
      gateway: { only: ["openai"] },
      ...(route.reasoningEffort === "low" ? { openai: { reasoningEffort: "low" } } : {}),
    } },
  };
}
