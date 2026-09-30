import { defineState } from "eve/context";
import type { SessionContext } from "eve/tools";
import type { AgentTraces } from "./agent-trace.js";
import { traceViewerUrl } from "./agent-trace.js";
import { slackCaller } from "./slack-policy.js";

export const agentTraces = defineState<AgentTraces>("vee.agent-traces.v1", () => []);

export function inspectAgentRun(ctx: SessionContext, turnKey?: string) {
  slackCaller(ctx);
  const traces = agentTraces.get();
  return {
    scope: "current_conversation", traces: turnKey ? traces.filter((trace) => trace.turnKey === turnKey) : traces.slice(-3),
    viewer: traceViewerUrl(),
    note: "Operational trace only. Contains no messages, prompts, reasoning, tool arguments, results, credentials, or raw errors. Routing records the model selected by Vee; Eve 0.24.6 does not report the provider-served model here. Times include approval/authorization waits. Active turns are incomplete. At most 6 recent turns and 200 entries per turn are retained. The optional Vercel viewer requires project access and has its own retention and content controls.",
  };
}
