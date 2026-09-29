import { startAuthorization } from "@vercel/connect";
import { sharedConnections } from "../agent/lib/shared-auth.ts";
import { checkConnection, formatConnectionCheck } from "../agent/lib/connection-check.ts";
import { classifyFailure } from "../agent/lib/provider-errors.ts";

const [command, ...args] = process.argv.slice(2);
let name;
let slackUser;
let invalid = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--slack-user" && !slackUser && args[i + 1]) slackUser = args[++i];
  else if (!name && !args[i].startsWith("--")) name = args[i];
  else invalid = true;
}
if (!["check", "authorize"].includes(command) || invalid || (slackUser && !/^[UW][A-Z0-9]+$/.test(slackUser))) {
  console.error("Usage: connections.js check [connection] [--slack-user U...] | authorize <shared-connection>");
  process.exit(1);
}
if (name && name !== "slack-search" && !Object.hasOwn(sharedConnections, name)) {
  console.error(`Choose a connection: ${Object.keys(sharedConnections).join(", ")}, slack-search`);
  process.exit(1);
}

if (command === "check") {
  if (name === "slack-search" && !slackUser) {
    console.error("Slack checks require --slack-user <user-id>. The shared Slack grant is never used.");
    process.exit(1);
  }
  const names = name ? [name] : [...Object.keys(sharedConnections), ...(slackUser ? ["slack-search"] : [])];
  for (const target of names) {
    const report = await checkConnection(target, slackUser);
    console.log(formatConnectionCheck(report));
    if (report.failure) process.exitCode = 1;
  }
  if (!name && !slackUser) console.log("slack-search: per-user authorization; run pnpm connections:check slack-search --slack-user <user-id> for a read-only identity, MCP, and retrieval check.");
} else if (name === "slack-search") {
  console.error("Shared Slack authorization is retired. Ask Vee to connect or reconnect Slack using your own account. Private-channel consent is available only in your DM with Vee. The old shared grant is retained, but never used as a fallback.");
  process.exitCode = 1;
} else if (!name || slackUser) {
  console.error(`Choose a shared connection: ${Object.keys(sharedConnections).join(", ")}`);
  process.exitCode = 1;
} else {
  const { connector, ...params } = sharedConnections[name];
  if (params.subject.type === "app") {
    console.log(`Install/configure ${connector} for the linked Vee project in Vercel Connect, then run pnpm connections:check ${name}.`);
  } else {
    try {
      const authorization = await startAuthorization(connector, params, { expiresInMs: 600_000 });
      console.log("Administrator setup: use the designated V1 account. Everything this account can access may be available to Vee's users. Do not connect a personal account.");
      console.log(authorization.url);
      console.log(`After consent, run pnpm connections:check ${name}. No tokens or retrieved source content are printed or saved by this script.`);
    } catch (error) {
      console.error(`${name}: ${classifyFailure(error).code}. Check the connector, project attachment, and local Vercel credentials.`);
      process.exitCode = 1;
    }
  }
}
