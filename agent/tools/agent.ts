import { disableTool } from "eve/tools";

// The first release keeps private context in one session, with no delegation
// into child sessions or a separately populated memory.
export default disableTool();
