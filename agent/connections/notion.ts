import { sharedAuth } from "../lib/shared-auth.js";
import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://mcp.notion.com/mcp",
  description:
    "V1's shared Notion workspace. Search, read, create, and update team content.",
  auth: sharedAuth("notion"),
});
