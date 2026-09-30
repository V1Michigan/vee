import { defineTool } from "eve/tools";
import { z } from "zod";
import { inspectAgentRun } from "../lib/trace-state.js";

export default defineTool({
  description: "Inspect Vee's recent execution trace in this conversation: model steps, tools, service operations, sign-in or approval waits, safe failure codes, token usage and cost where available. Use to explain what Vee did or why a request failed. Never retrieves another conversation or raw private content.",
  inputSchema: z.object({ turnKey: z.string().regex(/^[a-f0-9]{24}$/).optional() }).strict(),
  execute: ({ turnKey }, ctx) => inspectAgentRun(ctx, turnKey),
});
