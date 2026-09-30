import { createHash } from "node:crypto";
import type { StreamEventHooks } from "eve/hooks";
import { failureCode, safeToolName } from "./turn-metrics.js";
import { teamServices } from "./team-services.js";
import { safeModelRoute, type ModelRoute } from "./model-routing.js";

type Event = Parameters<NonNullable<StreamEventHooks["*"]>>[0];
export type TraceEntry = {
  key: string; event: string; at: string; step?: number; tool?: string;
  service?: string; operation?: string; status?: string; failure?: string;
  inputTokens?: number; outputTokens?: number; costUsd?: number;
};
export type AgentTrace = {
  turnKey: string; startedAt: string; finishedAt?: string;
  outcome: "active" | "completed" | "failed" | "cancelled";
  entries: TraceEntry[]; truncated: boolean;
  routing?: ModelRoute;
};
export type AgentTraces = AgentTrace[];
export const MAX_TRACE_TURNS = 6;
export const MAX_TRACE_ENTRIES = 200;
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);

/** Select fields, never serialize a raw event, argument, result, or exception. */
export function traceEntries(event: Event, now: number): TraceEntry[] {
  if (!("data" in event) || !("turnId" in event.data)) return [];
  const stamp = event.meta?.at ? Date.parse(event.meta.at) : now;
  const at = new Date(Number.isFinite(stamp) ? stamp : now).toISOString();
  const base = { at, ...("stepIndex" in event.data ? { step: event.data.stepIndex } : {}) };
  const sequence = event.data.sequence;
  const entry = (extra: Partial<TraceEntry> = {}, suffix = ""): TraceEntry => ({
    ...base, key: hash(`${event.type}/${sequence}/${base.step ?? "turn"}/${suffix}`), event: event.type, ...extra,
  });
  switch (event.type) {
    case "turn.started": case "step.started": case "turn.completed": case "turn.cancelled":
      return [entry()];
    case "turn.failed": case "step.failed": return [entry({ failure: failureCode(event.data) })];
    case "authorization.required": return [entry({ status: "waiting_for_authorization" })];
    case "authorization.completed": return [entry({ status: event.data.outcome }, event.data.outcome)];
    case "input.requested": return [entry({ status: "waiting_for_input" })];
    case "step.completed": {
      const usage: Partial<TraceEntry> = {};
      for (const name of ["inputTokens", "outputTokens", "costUsd"] as const) {
        const value = event.data.usage?.[name];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) usage[name] = value;
      }
      return [entry(usage)];
    }
    case "actions.requested": return event.data.actions.map((action) => {
      if (action.kind !== "tool-call") return entry({ tool: action.kind === "load-skill" ? "load_skill" : "other", status: "requested" }, action.callId);
      const detail: Partial<TraceEntry> = { tool: safeToolName(action.toolName), status: "requested" };
      // Service and operation come from our catalog, never from free-form args.
      if (["find_team_tools", "read_team_data", "execute_team_action"].includes(action.toolName)) {
        for (const [service, config] of Object.entries(teamServices)) if (action.input.service === service) {
          detail.service = service;
          if (typeof action.input.tool === "string" && [...config.reads, ...config.writes, ...(config.drafts ?? [])].includes(action.input.tool)) detail.operation = action.input.tool;
        }
      }
      return entry(detail, action.callId);
    });
    case "action.result": return [entry({
      tool: event.data.result.kind === "tool-result" ? safeToolName(event.data.result.toolName) : event.data.result.kind === "load-skill-result" ? "load_skill" : "other",
      status: event.data.status,
      ...(event.data.status === "failed" ? { failure: failureCode(event.data.error) } : {}),
    }, event.data.result.callId)];
    default: return [];
  }
}

export function reduceAgentTraces(previous: AgentTraces, event: Event, sessionId: string, now: number, route?: ModelRoute | null): AgentTraces {
  const entries = traceEntries(event, now);
  if (!entries.length || !("data" in event) || !("turnId" in event.data)) return previous;
  const turnKey = hash(`${sessionId}/${event.data.turnId}`);
  const traces = structuredClone(previous);
  let trace = traces.find((item) => item.turnKey === turnKey);
  if (!trace) {
    trace = { turnKey, startedAt: entries[0].at, outcome: "active", entries: [], truncated: false };
    traces.push(trace);
  }
  const routing = safeModelRoute(route);
  if (!trace.routing && routing) trace.routing = routing;
  for (const entry of entries) if (!trace.entries.some((item) => item.key === entry.key)) {
    // Keep the beginning, where retrieval choices were made. Still update the
    // terminal state when a very long run reaches this bounded storage limit.
    if (trace.entries.length < MAX_TRACE_ENTRIES) trace.entries.push(entry);
    else trace.truncated = true;
  }
  if (trace.outcome === "active" && ["turn.completed", "turn.failed", "turn.cancelled"].includes(event.type)) {
    trace.outcome = event.type === "turn.completed" ? "completed" : event.type === "turn.failed" ? "failed" : "cancelled";
    trace.finishedAt = entries[0].at;
  }
  return traces.slice(-MAX_TRACE_TURNS);
}

export function traceViewerUrl(value = process.env.VEE_AGENT_RUNS_URL): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.origin !== "https://vercel.com" || url.username || url.password || url.search || url.hash
      || !/^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/observability\/agent-runs\/?$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
