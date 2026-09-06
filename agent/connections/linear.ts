import { connect } from "@vercel/connect/eve";
import { defineMcpClientConnection } from "eve/connections";
import { always } from "eve/tools/approval";

export default defineMcpClientConnection({
  url: "https://mcp.linear.app/mcp",
  description:
    "V1's Linear workspace. Use for searching and creating issues for the Platform team.",
  // Linear issue creation changes external data, so require approval for every call.
  approval: always(),
  auth: connect({
    connector: "linear/vee",
    principalType: "app",
    instructions:
      "Install the shared V1 Linear connector for Vee and grant access to the V1 workspace.",
  }),
});
