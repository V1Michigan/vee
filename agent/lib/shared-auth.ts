import { connect } from "@vercel/connect/eve";
import type { ConnectTokenParams } from "@vercel/connect";
import { ConnectionAuthorizationFailedError } from "eve/connections";

// These identities belong to Vee, never to the Slack requester. OAuth grants
// are provisioned by an operator using scripts/connections.js, outside chat.
export const sharedConnections = {
  agentmail: { connector: "mcp.agentmail.to/vee", subject: { type: "user", id: "vee-shared-agentmail-v1" } },
  notion: { connector: "mcp.notion.com/notion", subject: { type: "user", id: "vee-shared-notion-v2" } },
  github: {
    connector: "github/vee", subject: { type: "app" },
    authorizationDetails: [{ type: "github_app_installation", org: "V1Michigan", repositories: ["vee", "website-v2"] }],
  },
  "slack-search": {
    connector: "slack/vee", subject: { type: "user", id: "vee-shared-slack-search-v1" },
    scopes: ["search:read.public"],
  },
  "google-calendar": { connector: "calendarmcp.googleapis.com/google-calendar", subject: { type: "user", id: "vee-shared-calendar-v1" } },
  granola: { connector: "mcp.granola.ai/granola", subject: { type: "user", id: "vee-shared-granola-v1" } },
} satisfies Record<string, ConnectTokenParams & { connector: string }>;

export type SharedConnectionName = keyof typeof sharedConnections;

export function sharedAuth(name: SharedConnectionName) {
  const { connector, subject, ...tokenParams } = sharedConnections[name];
  return connect({
    connector,
    // App is Eve's non-interactive lifecycle. createSubject deliberately keeps
    // a fixed OAuth user grant where the provider requires user authorization.
    principalType: "app",
    createSubject: () => subject,
    tokenParams,
    validate: true,
    onError: () => new ConnectionAuthorizationFailedError(name, {
      reason: "shared_connection_unavailable",
      retryable: false,
      message: `Vee's shared ${name} connection is unavailable. A Vee administrator must check or reconnect it using pnpm connections:authorize ${name}. Individual Slack users do not need to sign in.`,
    }),
  });
}
