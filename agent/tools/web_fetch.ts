import { defineTool } from "eve/tools";
import { webFetch } from "eve/tools/defaults";
import { assertNoPrivateSlackExport } from "../lib/private-session.js";
import { slackCaller } from "../lib/slack-policy.js";
import { classifyFailure } from "../lib/provider-errors.js";

export default defineTool({
  ...webFetch,
  async execute(input, ctx) {
    slackCaller(ctx);
    assertNoPrivateSlackExport();
    try { return await webFetch.execute(input, ctx); } catch (error) { throw classifyFailure(error); }
  },
});
