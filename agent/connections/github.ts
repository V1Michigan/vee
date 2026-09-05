import { sharedAuth } from "../lib/shared-auth.js";
import { defineMcpClientConnection } from "eve/connections";

const allowedTools = [
  "get_me",
  "get_file_contents",
  "list_branches",
  "create_branch",
  "create_or_update_file",
  "push_files",
  "issue_read",
  "list_issues",
  "search_issues",
  "issue_write",
  "list_pull_requests",
  "pull_request_read",
  "create_pull_request",
];

export default defineMcpClientConnection({
  url: "https://api.githubcopilot.com/mcp/",
  description:
    "V1Michigan/vee contains Vee's own code; V1Michigan/website-v2 contains V1 at Michigan's website. Read code, create vee/* branches, open pull requests, and file or review issues within these repositories.",
  tools: { allow: allowedTools },
  headers: {
    "X-MCP-Tools": allowedTools.join(","),
  },
  auth: sharedAuth("github"),
});
