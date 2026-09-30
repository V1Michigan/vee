import { defineHook } from "eve/hooks";
import { reduceAgentTraces } from "../lib/agent-trace.js";
import { agentTraces } from "../lib/trace-state.js";

export default defineHook({
  events: {
    "*": (event, ctx) => {
      try {
        const before = agentTraces.get();
        const after = reduceAgentTraces(before, event, ctx.session.id, Date.now());
        if (after !== before) agentTraces.update(() => after);
      } catch {
        // A failed observer cannot fail the user's turn or print source data.
        console.warn("vee.trace_unavailable");
      }
    },
  },
});
