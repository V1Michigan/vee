import { z } from "zod";

export const serviceSchema = z.enum(["notion", "granola", "google-calendar", "github", "agentmail"]);
export const teamCallSchema = z.object({
  service: serviceSchema,
  tool: z.string().min(1).max(80),
  arguments: z.record(z.string(), z.unknown()).refine((value) => JSON.stringify(value).length <= 32_000, "Split large actions into separately approved changes."),
}).strict();
