import { defineTool } from "eve/tools";
import { teamCallSchema } from "../lib/team-schema.js";
import { approveTeamAction } from "../lib/action-approval.js";
import { executeTeamAction } from "../lib/team-tools.js";

export default defineTool({
  description: "Propose one exact external action using a permitted provider tool from find_team_tools. The original requester must approve the complete arguments. Changing any argument requires a new call and approval. Preparing AgentMail drafts is the only approval exception. Do not repeat a write with an unknown outcome; inspect the destination first.",
  inputSchema: teamCallSchema,
  approval: (ctx) => approveTeamAction(ctx),
  execute: (input, ctx) => executeTeamAction(input, ctx),
});
