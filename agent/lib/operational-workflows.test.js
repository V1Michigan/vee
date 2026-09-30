import assert from "node:assert/strict";
import test from "node:test";
import { reconcileRecords, reconciliationSchema } from "./record-reconciliation.ts";
import { planTeamTasks, taskPlanningSchema, isCalendarDate } from "./task-planning.ts";
import reconcileTool from "../tools/reconcile_records.ts";
import taskTool from "../tools/plan_team_tasks.ts";
import { privateSlackSession } from "./private-session.ts";

const sourceA = "https://v1michigan.slack.com/archives/CA/p123";
const sourceB = "https://app.notion.com/p/0123456789abcdef0123456789abcdef";
const record = (sourceUrl, value, key = "2026/example/fireside") => ({ kind: "event", key, title: "Example Fireside", sourceUrl, facts: [{ field: "start", value }] });
const candidate = (fields = {}) => ({ title: "Confirm room", fields, sources: [sourceA] });
const plan = (extra = {}) => ({ destination: sourceB, candidates: [candidate()], existing: [], ...extra });

test("event reconciliation keeps conflicting times and deduplicates repeated sources", () => {
  const a = record(sourceA, "18:00");
  const result = reconcileRecords({ records: [a, a, record(sourceB, "19:00")] });
  const start = result.entities[0].fields.find((field) => field.field === "start");
  assert.equal(result.entities.length, 1);
  assert.equal(start.status, "conflicting");
  assert.deepEqual(start.values, [{ value: "18:00", sources: [sourceA] }, { value: "19:00", sources: [sourceB] }]);
  assert.equal(result.entities[0].fields.find((field) => field.field === "owner").status, "missing");
  assert.equal(result.coverage, "provided_records_only");
});

test("event/company/year boundaries are kept and payment is never inferred", () => {
  const result = reconcileRecords({ records: [record(sourceA, "18:00"), record(sourceA, "20:00", "2026/example/dinner"), record(sourceA, "18:00", "2027/example/fireside"), { kind: "company", key: "2026/example/fireside", title: "Example", sourceUrl: sourceA, facts: [{ field: "status", value: "Confirmed" }] }], requiredFields: ["payment"] });
  assert.equal(result.entities.length, 4);
  for (const item of result.entities) assert.equal(item.fields.find((field) => field.field === "payment").status, "missing");
});

test("task proposal preserves unspecified fields and reports exact before/after changes", () => {
  const result = planTeamTasks(plan({ candidates: [candidate({ status: "Confirmed" })], existing: [{ ...candidate({ owner: "UA", dueDate: "2026-10-01", status: "Tentative" }), id: "row-1" }] }));
  const row = result.proposals[0];
  assert.equal(row.action, "update");
  assert.deepEqual(row.changes, [{ field: "status", before: "Tentative", after: "Confirmed" }]);
  assert.deepEqual(row.missing, []);
  assert.equal(row.requiresApproval, true);
  assert.equal(row.requiresFreshDestinationCheck, true);
});

test("duplicate candidates and ambiguous existing matches require review", () => {
  const conflicting = planTeamTasks(plan({ candidates: [candidate({ owner: "UA" }), candidate({ owner: "UB" })] }));
  assert.equal(conflicting.proposals[0].action, "needs_review");
  assert.deepEqual(conflicting.proposals[0].conflicts, ["owner"]);
  const duplicate = planTeamTasks(plan({ existing: [{ ...candidate(), id: "1" }, { ...candidate(), id: "2" }] }));
  assert.equal(duplicate.proposals[0].action, "needs_review");
  assert.deepEqual(duplicate.proposals[0].matchedIds, ["1", "2"]);
  assert.equal(planTeamTasks(plan({ candidates: [candidate(), candidate()] })).proposals.length, 1);
});

test("incomplete snapshots and missing task details remain explicit", () => {
  const result = planTeamTasks(plan());
  assert.equal(result.coverage, "provided_tasks_only");
  assert.deepEqual(result.proposals[0].missing, ["owner", "dueDate"]);
  assert.equal(result.status, "proposal");
  assert.equal(result.proposals[0].requiresFreshDestinationCheck, true);
  assert.equal(planTeamTasks(plan({ existing: [{ ...candidate(), id: "1" }] })).proposals[0].action, "unchanged");
});

test("schemas reject invented calendar dates, unbounded payloads and unsafe source URLs", () => {
  assert.equal(isCalendarDate("2026-02-29"), false);
  assert.equal(isCalendarDate("2028-02-29"), true);
  assert.equal(isCalendarDate("2026-13-01"), false);
  assert.equal(taskPlanningSchema.safeParse(plan({ candidates: [candidate({ dueDate: "2026-02-29" })] })).success, false);
  assert.equal(taskPlanningSchema.safeParse(plan({ destination: "https://evil.test/0123456789abcdef0123456789abcdef" })).success, false);
  for (const url of ["javascript:alert(1)", "https://user:secret@example.com"]) assert.equal(reconciliationSchema.safeParse({ records: [record(url, "18:00")] }).success, false);
  assert.equal(reconciliationSchema.safeParse({ records: Array.from({ length: 100 }, (_, i) => ({ ...record(sourceA, "x".repeat(500), `${i}`), facts: Array.from({ length: 20 }, () => ({ field: "status", value: "x".repeat(500) })) })) }).success, false);
});

test("workflow tools enforce requester and private export boundaries before computation", (t) => {
  const previous = process.env.VEE_SLACK_ROLLOUT;
  process.env.VEE_SLACK_ROLLOUT = "enabled";
  t.after(() => previous === undefined ? delete process.env.VEE_SLACK_ROLLOUT : process.env.VEE_SLACK_ROLLOUT = previous);
  t.mock.method(privateSlackSession, "get", () => true);
  const current = { authenticator: "slack-webhook", principalType: "user", principalId: "slack:T02UZ8D4ZMY:UA", issuer: "slack:T02UZ8D4ZMY", attributes: { team_id: "T02UZ8D4ZMY", user_id: "UA", channel_id: "DA", vee_surface: "dm" } };
  const ctx = { session: { auth: { current, initiator: current } } };
  assert.throws(() => taskTool.execute(plan(), ctx), { code: "private_session_restricted" });
  assert.equal(reconcileTool.execute({ records: [record(sourceA, "18:00")] }, ctx).entities.length, 1);
  assert.throws(() => reconcileTool.execute({ records: [record(sourceA, "18:00")] }, { session: { auth: {} } }), { code: "access_denied" });
});
