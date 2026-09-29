import { defineTool } from "eve/tools";
import { teamCallSchema } from "../lib/team-schema.js";
import { readTeamData } from "../lib/team-tools.js";

export default defineTool({
  description: "Read authorized team records through a tool returned by find_team_tools. Follow that tool's exact schema and omit unused arguments. Writes are rejected. Cite sources and report incomplete searches accurately.",
  inputSchema: teamCallSchema,
  execute: readTeamData,
});
