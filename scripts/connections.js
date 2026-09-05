import { getTokenResponse, startAuthorization } from "@vercel/connect";
import { sharedConnections } from "../agent/lib/shared-auth.ts";

const [command, name] = process.argv.slice(2);
if (command !== "check" && command !== "authorize") {
  console.error("Usage: connections.js check | authorize <connection>");
  process.exit(1);
}
if (command === "authorize" && !Object.hasOwn(sharedConnections, name ?? "")) {
  console.error(`Choose a connection: ${Object.keys(sharedConnections).join(", ")}`);
  process.exit(1);
}

if (command === "check") {
  for (const [key, { connector, ...params }] of Object.entries(sharedConnections)) {
    try {
      await getTokenResponse(connector, params);
      console.log(`${key}: shared credential available (provider access still needs verification)`);
    } catch (error) {
      // Do not print raw provider errors: they can contain secrets or URLs.
      const code = typeof error?.code === "string" && /^[a-z_]+$/.test(error.code) ? error.code : "unavailable";
      console.log(`${key}: ${code}`);
      process.exitCode = 1;
    }
  }
} else {
  const { connector, ...params } = sharedConnections[name];
  if (params.subject.type === "app") {
    console.log(`Install/configure ${connector} for the linked Vee project in Vercel Connect, then run pnpm connections:check.`);
  } else {
    try {
      const authorization = await startAuthorization(connector, params, { expiresInMs: 600_000 });
      console.log("Administrator setup: use the designated V1 account. Everything this account can access may be available to Vee's users. Do not connect a personal account.");
      console.log(authorization.url);
      console.log("After completing consent, run pnpm connections:check. No access tokens are printed or saved by this script.");
    } catch {
      console.error(`Could not start shared authorization for ${name}. Check the connector and project attachment in Vercel Connect, and refresh local Vercel credentials.`);
      process.exitCode = 1;
    }
  }
}
