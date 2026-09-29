import { disableTool } from "eve/tools";

// Eve's provider-managed web search bypasses authored execution guards. Do not
// expose it while private Slack context can be in the model's current session.
// Direct public references remain available through the guarded web_fetch.
export default disableTool();
