import assert from "node:assert/strict";
import test from "node:test";
import { isDisabledToolSentinel } from "eve/tools";
import bash from "../tools/bash.ts";
import agent from "../tools/agent.ts";
import webSearch from "../tools/web_search.ts";
import webFetch from "../tools/web_fetch.ts";

test("framework tools that bypass destination or private-session checks remain disabled", () => {
  for (const definition of [bash, agent, webSearch, webFetch]) assert.equal(isDisabledToolSentinel(definition), true);
});
