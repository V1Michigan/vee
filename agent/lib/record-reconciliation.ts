import { z } from "zod";

export const sourceUrlSchema = z.string().max(2000).url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Use an HTTPS source permalink without credentials.");

export const recordFields = ["company", "event", "date", "start", "end", "timezone", "location", "format", "status", "owner", "tier", "audience", "roles", "sponsorship", "payment", "next_action"] as const;
const fieldSchema = z.enum(recordFields);
const recordSchema = z.object({
  kind: z.enum(["event", "company"]), key: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(200), sourceUrl: sourceUrlSchema,
  facts: z.array(z.object({ field: fieldSchema, value: z.string().trim().min(1).max(500) }).strict()).min(1).max(20),
}).strict();
export const reconciliationSchema = z.object({
  records: z.array(recordSchema).min(1).max(100),
  requiredFields: z.array(fieldSchema).min(1).max(16).optional(),
}).strict().refine((value) => JSON.stringify(value).length <= 48_000, "Limit this comparison to 48 KB and split larger scopes explicitly.");
type Input = z.infer<typeof reconciliationSchema>;
export function normalizedName(value: string): string { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"); }

/** Only exact normalized keys are merged. Different dates/events need different keys. */
export function reconcileRecords(input: Input) {
  const records = reconciliationSchema.parse(input).records;
  const groups = new Map<string, typeof records>();
  for (const record of records) {
    const key = `${record.kind}:${normalizedName(record.key)}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return {
    coverage: "provided_records_only",
    entities: [...groups].map(([key, rows]) => {
      const required = input.requiredFields ?? (rows[0].kind === "event" ? ["date", "start", "timezone", "location", "owner"] : ["status", "owner", "next_action"]);
      const fields = [...new Set([...required, ...rows.flatMap((row) => row.facts.map((fact) => fact.field))])];
      return {
        key, kind: rows[0].kind, titles: [...new Set(rows.map((row) => row.title))],
        sources: [...new Set(rows.map((row) => row.sourceUrl))],
        fields: fields.map((field) => {
          const values = new Map<string, { value: string; sources: Set<string> }>();
          for (const row of rows) for (const fact of row.facts) if (fact.field === field) {
            const normalized = normalizedName(fact.value);
            const item = values.get(normalized) ?? { value: fact.value, sources: new Set<string>() };
            item.sources.add(row.sourceUrl);
            values.set(normalized, item);
          }
          return { field, status: values.size === 0 ? "missing" : values.size === 1 ? "consistent" : "conflicting",
            values: [...values.values()].map(({ value, sources }) => ({ value, sources: [...sources] })) };
        }),
      };
    }),
    note: "This compares supplied, extracted claims. It does not verify sources, establish independent corroboration, select a winner in a conflict, or prove a complete roster. Confirm facts against retrieved originals. Do not infer payment from attendance or confirmation. Repeated source links are counted once. Similar names are not automatically merged.",
  };
}
