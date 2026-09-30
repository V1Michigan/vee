import { readFileSync } from "node:fs";
import { chooseModelRoute, ROUTING_POLICY_VERSION } from "../agent/lib/model-routing.ts";

// Synthetic fixtures only. This command never loads credentials or calls a model.
const cases = JSON.parse(readFileSync(new URL("../tests/fixtures/model-routing.json", import.meta.url), "utf8"));
const profiles = { standard: 0, deep: 0 };
const mismatches = [];
for (const item of cases) {
  const actual = chooseModelRoute(item.prompt, item.mode ?? "auto");
  profiles[actual.profile]++;
  if (actual.profile !== item.profile || actual.reason !== item.reason) mismatches.push({
    id: item.id, expectedProfile: item.profile, actualProfile: actual.profile, expectedReason: item.reason, actualReason: actual.reason,
  });
}
console.log(JSON.stringify({
  scope: "offline_policy_fixtures", policyVersion: ROUTING_POLICY_VERSION,
  total: cases.length, passed: cases.length - mismatches.length, profiles, mismatches,
  note: "Checks routing decisions, not answer quality, provider access, live resumes, latency, or cost savings.",
}, null, 2));
process.exitCode = mismatches.length ? 1 : 0;
