import { createHash } from "node:crypto";
import type { StreamEventHooks } from "eve/hooks";
import { failureCodes } from "./provider-errors.js";
import { safeModelRoute, type ModelRoute } from "./model-routing.js";

type Event = Parameters<NonNullable<StreamEventHooks["*"]>>[0];
type Usage = { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number; costUsd?: number };
type ToolMetric = { name: string; startedAt: number; status?: "completed" | "failed" | "rejected"; durationMs?: number; failureCode?: string };
export type TurnMetrics = {
  turnId: string; startedAt: number; endedAt?: number; outcome?: "completed" | "failed" | "cancelled";
  stepStarts: Record<string, number>; steps: Record<string, { usage: Usage; durationMs: number | null }>;
  tools: Record<string, ToolMetric>; failureCode?: string;
  routing?: ModelRoute;
};

const safeTools = new Set(["search_slack", "read_slack", "reconnect_slack", "find_team_tools", "read_team_data", "execute_team_action", "list_agentmail_inboxes", "check_ai_gateway_usage", "inspect_agent_run", "check_connections", "reconcile_records", "plan_team_tasks", "validate_announcement", "web_fetch", "read_file", "write_file", "glob", "grep", "todo", "ask_question"]);

export function safeToolName(name: string): string { return safeTools.has(name) ? name : "other"; }

export function failureCode(error?: { code?: string; message?: string }): string {
  if (error?.code && failureCodes.has(error.code)) return error.code;
  const prefix = error?.message?.match(/^([a-z_]+):/)?.[1];
  return prefix && failureCodes.has(prefix) ? prefix : "runtime_error";
}

/** Only counters, timings, and an allowlisted failure code survive this reducer. */
export function reduceTurnMetrics(previous: TurnMetrics | null, event: Event, now: number, route?: ModelRoute | null): TurnMetrics | null {
  if (!("data" in event) || !("turnId" in event.data)) return previous;
  const state: TurnMetrics = previous && previous.turnId === event.data.turnId ? structuredClone(previous)
    : { turnId: event.data.turnId, startedAt: now, stepStarts: {}, steps: {}, tools: {} };
  const routing = safeModelRoute(route);
  if (!state.routing && routing) state.routing = routing;
  if (event.type === "step.started") state.stepStarts[event.data.stepIndex] ??= now;
  if (event.type === "step.completed") {
    const start = state.stepStarts[event.data.stepIndex];
    // Explicitly select numeric fields. Never spread provider metadata or usage.
    const usage: Usage = {};
    for (const key of ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "costUsd"] as const) {
      const value = event.data.usage?.[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) usage[key] = value;
    }
    state.steps[event.data.stepIndex] ??= { usage, durationMs: start === undefined ? null : Math.max(0, now - start) };
  }
  if (event.type === "actions.requested") {
    for (const action of event.data.actions) if (action.kind === "tool-call") state.tools[action.callId] ??= {
      name: safeTools.has(action.toolName) ? action.toolName : "other", startedAt: now,
    };
  }
  if (event.type === "action.result" && event.data.result.kind === "tool-result") {
    const result = event.data.result;
    const metric = state.tools[result.callId] ?? { name: safeTools.has(result.toolName) ? result.toolName : "other", startedAt: now };
    if (!metric.status) {
      metric.status = event.data.status;
      metric.durationMs = Math.max(0, now - metric.startedAt);
      if (event.data.status === "failed") metric.failureCode = failureCode(event.data.error);
      state.tools[result.callId] = metric;
    }
  }
  if (["turn.completed", "turn.failed", "turn.cancelled"].includes(event.type) && !state.outcome) {
    state.endedAt = now;
    state.outcome = event.type === "turn.completed" ? "completed" : event.type === "turn.failed" ? "failed" : "cancelled";
    if (event.type === "turn.failed") state.failureCode = failureCode(event.data);
  }
  return state;
}

export function turnMetricsReport(state: TurnMetrics, sessionId: string) {
  const routing = safeModelRoute(state.routing);
  const steps = Object.values(state.steps);
  const tools = Object.values(state.tools);
  const sum = (key: keyof Usage) => steps.length && steps.every((step) => step.usage[key] !== undefined)
    ? steps.reduce((total, step) => total + step.usage[key]!, 0) : null;
  return {
    event: "vee.turn", schemaVersion: 2,
    turnKey: createHash("sha256").update(`${sessionId}/${state.turnId}`).digest("hex").slice(0, 24),
    model: routing?.model ?? null, modelAttribution: routing ? "selected" : "unknown", routing,
    outcome: state.outcome ?? "active",
    latencyMs: state.endedAt === undefined ? null : Math.max(0, state.endedAt - state.startedAt),
    modelCalls: steps.length, inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"),
    cacheReadTokens: sum("cacheReadTokens"), cacheWriteTokens: sum("cacheWriteTokens"), costUsd: sum("costUsd"),
    usageComplete: steps.length > 0 && steps.every((step) => step.usage.inputTokens !== undefined && step.usage.outputTokens !== undefined),
    tools: tools.map(({ name, status, durationMs, failureCode }) => ({ name, status: status ?? "unfinished", durationMs: durationMs ?? null, ...(failureCode ? { failureCode } : {}) })),
    toolCalls: tools.length, toolFailures: tools.filter((tool) => tool.status === "failed").length,
    toolRejections: tools.filter((tool) => tool.status === "rejected").length,
    ...(state.failureCode ? { failureCode: state.failureCode } : {}),
  };
}
