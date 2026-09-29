import { defineInstrumentation } from "eve/instrumentation";

// Numeric usage comes from Eve hooks. Do not export conversations or tool
// payloads, including OAuth challenges and private Slack results, as telemetry.
export default defineInstrumentation({ recordInputs: false, recordOutputs: false });
