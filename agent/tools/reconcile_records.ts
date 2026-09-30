import { defineTool } from "eve/tools";
import { reconciliationSchema, reconcileRecords } from "../lib/record-reconciliation.js";
import { slackCaller } from "../lib/slack-policy.js";

export default defineTool({
  description: "Compare already-retrieved event or company records into a source-linked brief. Exact keys group records; conflicting facts and required missing fields stay visible. Pass distinct keys for different events or years. This local computation does not fetch sources, verify claims, prove completeness, or write records.",
  inputSchema: reconciliationSchema,
  execute(input, ctx) { slackCaller(ctx); return reconcileRecords(input); },
});
