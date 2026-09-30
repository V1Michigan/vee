import { defineAgent, defineDynamic } from "eve";
import { MODEL_PROFILES } from "./lib/model-routing.js";
import { resolveTurnModel } from "./lib/routing-state.js";

export default defineAgent({
  model: defineDynamic({
    fallback: MODEL_PROFILES.standard.model,
    events: { "turn.started": resolveTurnModel },
  }),
  modelOptions: {
    providerOptions: {
      gateway: {
        only: ["openai"],
      },
    },
  },
});
