import { disableTool } from "eve/tools";

// Eve's provider-managed web search bypasses authored execution guards. Do not
// expose it while private Slack context can be in the model's current session.
// A future web adapter must enforce destination and private-session boundaries.
export default disableTool();
