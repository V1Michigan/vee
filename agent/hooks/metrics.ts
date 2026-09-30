import { defineHook } from "eve/hooks";
import { defineState } from "eve/context";
import { reduceTurnMetrics, turnMetricsReport, type TurnMetrics } from "../lib/turn-metrics.js";
import { routeForTurn } from "../lib/routing-state.js";

const metrics = defineState<TurnMetrics | null>("vee.turn-metrics.v1", () => null);
const events = new Set(["turn.started", "step.started", "step.completed", "actions.requested", "action.result", "turn.completed", "turn.failed", "turn.cancelled"]);

export default defineHook({
  events: {
    "*": (event, ctx) => {
      if (!events.has(event.type)) return;
      try {
        const before = metrics.get();
        const route = "data" in event && "turnId" in event.data ? routeForTurn(event.data.turnId) : null;
        const after = reduceTurnMetrics(before, event, Date.now(), route);
        metrics.update(() => after);
        if (after?.outcome && (before?.turnId !== after.turnId || !before?.outcome)) console.info(JSON.stringify(turnMetricsReport(after, ctx.session.id)));
      } catch {
        // Observability must not break a turn or serialize a raw event/error.
        console.warn("vee.metrics_unavailable");
      }
    },
  },
});
