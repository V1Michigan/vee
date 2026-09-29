import { disableTool } from "eve/tools";

// Shell network access would bypass the provider and mutation boundaries.
// Repository edits use the guarded GitHub actions instead.
export default disableTool();
