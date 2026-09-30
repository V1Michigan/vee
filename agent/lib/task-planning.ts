import { z } from "zod";
import { normalizedName, sourceUrlSchema } from "./record-reconciliation.js";

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const calendarDateSchema = z.string().refine(isCalendarDate, "Use a real calendar date in YYYY-MM-DD format.");
const fieldsSchema = z.object({
  owner: z.string().trim().min(1).max(100).optional(),
  dueDate: calendarDateSchema.optional(),
  status: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
}).strict();
const candidateSchema = z.object({ title: z.string().trim().min(1).max(200), fields: fieldsSchema,
  sources: z.array(sourceUrlSchema).min(1).max(10) }).strict();
export const taskPlanningSchema = z.object({
  destination: sourceUrlSchema.refine((value) => {
    const url = new URL(value);
    return ["app.notion.com", "www.notion.so", "notion.so"].includes(url.hostname) && /[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/i.test(url.pathname);
  }, "Use the actual Notion destination database URL."),
  candidates: z.array(candidateSchema).min(1).max(50),
  existing: z.array(candidateSchema.extend({ id: z.string().min(1).max(160) })).max(200),
}).strict().refine((value) => JSON.stringify(value).length <= 48_000, "Limit this proposal to 48 KB and split larger scopes explicitly.");
type Input = z.infer<typeof taskPlanningSchema>;

/** A local proposal, never an authorization or an external write. */
export function planTeamTasks(input: Input) {
  const parsed = taskPlanningSchema.parse(input);
  const groups = new Map<string, Input["candidates"]>();
  for (const candidate of parsed.candidates) {
    const key = normalizedName(candidate.title);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  return {
    destination: parsed.destination, coverage: "provided_tasks_only", status: "proposal",
    proposals: [...groups].map(([key, candidates]) => {
      const matches = parsed.existing.filter((task) => normalizedName(task.title) === key);
      const conflicts: string[] = [];
      const proposed: Record<string, string> = {};
      for (const field of ["owner", "dueDate", "status", "description"] as const) {
        const values = [...new Set(candidates.map((task) => task.fields[field]).filter((v): v is string => v !== undefined))];
        if (values.length > 1) conflicts.push(field);
        else if (values.length === 1) proposed[field] = values[0];
      }
      const existing = matches.length === 1 ? matches[0] : undefined;
      const current = existing?.fields ?? {};
      const changes = Object.entries(proposed).filter(([field, after]) => current[field as keyof typeof current] !== after)
        .map(([field, after]) => ({ field, before: current[field as keyof typeof current] ?? null, after }));
      const merged = { ...current, ...proposed };
      const missing = ["owner", "dueDate"].filter((field) => !merged[field as keyof typeof merged]);
      return {
        title: candidates[0].title, sources: [...new Set(candidates.flatMap((task) => task.sources))],
        matchedIds: matches.map((task) => task.id), conflicts, missing, changes,
        action: conflicts.length || matches.length > 1 ? "needs_review" : existing ? changes.length ? "update" : "unchanged" : "create",
        requiresFreshDestinationCheck: true, requiresApproval: true,
      };
    }),
    note: "Exact normalized titles are compared only within the supplied destination snapshot. A create proposal does not establish that no duplicate exists. Read the destination and its schema, check pagination and similar titles, resolve conflicts, and re-read target rows before preparing exact approved writes. Omitted fields preserve current values. Never invent owners or dates, add database fields, or infer authorization from this plan.",
  };
}
