import { connect } from "@vercel/connect/eve";
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
    "Vee's GitHub repository. Read code, create vee/* branches, open pull requests, and file or review issues.",
  tools: { allow: allowedTools },
  headers: {
    "X-MCP-Tools": allowedTools.join(","),
  },
  auth: connect({
    connector: "github/vee-github",
    principalType: "user",
    createSubject: () => ({
      type: "user" as const,
      id: "vee-shared-github-v1",
    }),
    tokenParams: {
      authorizationDetails: [
        {
          type: "github_app_installation",
          org: "V1Michigan",
          repositories: ["vee"],
        },
      ],
    },
    validate: true,
    instructions:
      "Authorize Vee for only the V1Michigan/vee repository using the shared V1 GitHub team account.",
  }),
});
