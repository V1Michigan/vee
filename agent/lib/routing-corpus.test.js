import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chooseModelRoute } from "./model-routing.ts";

const cases = JSON.parse(readFileSync(new URL("../../tests/fixtures/model-routing.json", import.meta.url), "utf8"));
for (const item of cases) test(`routing corpus: ${item.id}`, () => {
  const actual = chooseModelRoute(item.prompt, item.mode ?? "auto");
  assert.equal(actual.profile, item.profile);
  assert.equal(actual.reason, item.reason);
});
