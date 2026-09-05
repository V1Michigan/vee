import { sharedAuth } from "../lib/shared-auth.js";
import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://mcp.granola.ai/mcp",
  description:
    "Search and read meeting notes shared with Vee's designated V1 Granola account. Personal meeting notes are not connected.",
  auth: sharedAuth("granola"),
});
