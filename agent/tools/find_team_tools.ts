import { defineTool } from "eve/tools";
import { z } from "zod";
import { serviceSchema } from "../lib/team-schema.js";
import { findTeamTools } from "../lib/team-tools.js";

export default defineTool({
  description: "Discover Vee's allowed tools for one team service. First omit names to see the catalog, then request up to 5 names to obtain their current input schemas. Select a source based on the question. Slack uses search_slack and read_slack instead.",
  inputSchema: z.object({ service: serviceSchema, names: z.array(z.string().min(1).max(80)).min(1).max(5).optional() }).strict(),
  execute: (input, ctx) => findTeamTools(input.service, input.names, ctx),
});
