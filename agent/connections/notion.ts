import { connect } from "@vercel/connect/eve";
import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: "https://mcp.notion.com/mcp",
  description:
    "V1's shared Notion workspace. Search, read, create, and update team content.",
  auth: connect({
    connector: "mcp.notion.com/notion",
    principalType: "user",
    createSubject: () => ({
      type: "user" as const,
      id: "vee-shared-notion-v2",
    }),
    validate: true,
    instructions: "Authorize Vee using the shared V1 Notion team account.",
  }),
});
