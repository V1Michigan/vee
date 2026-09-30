import { defineTool } from "eve/tools";
import { taskPlanningSchema, planTeamTasks } from "../lib/task-planning.js";
import { slackCaller } from "../lib/slack-policy.js";
import { assertNoPrivateSlackExport } from "../lib/private-session.js";

export default defineTool({
  description: "Prepare a Notion task proposal from retrieved meeting/thread action items and an existing destination snapshot. Compares exact titles, flags duplicate candidates, conflicting fields, missing owners/dates, and before/after changes. Makes no writes. Recheck the destination before separately requesting approval through execute_team_action.",
  inputSchema: taskPlanningSchema,
  execute(input, ctx) { slackCaller(ctx); assertNoPrivateSlackExport(); return planTeamTasks(input); },
});
