import { defineTool } from "eve/tools";
import { gateway } from "ai";
import { z } from "zod";

const usageSchema = z.object({
  period: z.enum([
    "all_time",
    "past_30_days",
    "past_7_days",
    "past_24_hours",
  ]),
  start: z.string(),
  end: z.string(),
  totalCostUsd: z.number(),
  marketCostUsd: z.number(),
  requestCount: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cachedInputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
  reasoningTokens: z.number(),
});

const outputSchema = z.object({
  generatedAt: z.string(),
  accountScope: z.literal("team"),
  periods: z.array(usageSchema),
  note: z.string(),
});

type RawReportRow = {
  day?: unknown;
  hour?: unknown;
  totalCost?: unknown;
  marketCost?: unknown;
  requestCount?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  cachedInputTokens?: unknown;
  cacheCreationInputTokens?: unknown;
  reasoningTokens?: unknown;
};

type UsageMetrics = z.infer<typeof usageSchema>;
type UsageOutput = z.infer<typeof outputSchema>;

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { expiresAt: number; value: UsageOutput } | undefined;

function finiteNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgo(now: Date, days: number): Date {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function emptyMetrics(
  period: UsageMetrics["period"],
  start: string,
  end: string,
): UsageMetrics {
  return {
    period,
    start,
    end,
    totalCostUsd: 0,
    marketCostUsd: 0,
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    reasoningTokens: 0,
  };
}

function aggregate(
  rows: RawReportRow[],
  period: UsageMetrics["period"],
  start: string,
  end: string,
): UsageMetrics {
  const result = emptyMetrics(period, start, end);

  for (const row of rows) {
    result.totalCostUsd += finiteNumber(row.totalCost);
    result.marketCostUsd += finiteNumber(row.marketCost);
    result.requestCount += finiteNumber(row.requestCount);
    result.inputTokens += finiteNumber(row.inputTokens);
    result.outputTokens += finiteNumber(row.outputTokens);
    result.cachedInputTokens += finiteNumber(row.cachedInputTokens);
    result.cacheCreationInputTokens += finiteNumber(
      row.cacheCreationInputTokens,
    );
    result.reasoningTokens += finiteNumber(row.reasoningTokens);
  }

  result.totalCostUsd = roundCurrency(result.totalCostUsd);
  result.marketCostUsd = roundCurrency(result.marketCostUsd);
  return result;
}

async function fetchReport(
  startDate: string,
  endDate: string,
  datePart: "day" | "hour",
): Promise<RawReportRow[]> {
  try {
    const report = await gateway.getSpendReport({
      startDate,
      endDate,
      groupBy: "day",
      datePart,
    });
    return report.results;
  } catch (error) {
    throw new Error(
      "AI Gateway could not return the usage report. Confirm that Custom Reporting is available for the Vercel team and that this deployment belongs to that team.",
      { cause: error },
    );
  }
}

export default defineTool({
  description:
    "Get team-wide Vercel AI Gateway usage for all time, the past 30 days, the past 7 days, and the past 24 hours. Includes requests, tokens, Vercel-charged cost, and market cost across system credentials and BYOK.",
  inputSchema: z.object({}),
  outputSchema,
  async execute(_input, ctx) {
    const now = new Date();
    if (cache && cache.expiresAt > now.getTime()) {
      return cache.value;
    }

    const allTimeStart =
      process.env.AI_GATEWAY_USAGE_START_DATE ?? "2020-01-01";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(allTimeStart)) {
      throw new Error(
        "AI_GATEWAY_USAGE_START_DATE must use the YYYY-MM-DD format.",
      );
    }

    const today = utcDate(now);
    const thirtyDayStart = utcDate(daysAgo(now, 29));
    const sevenDayStart = utcDate(daysAgo(now, 6));
    const twentyFourHourCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const hourlyQueryStart = utcDate(twentyFourHourCutoff);

    const [dailyRows, hourlyRows] = await Promise.all([
      fetchReport(allTimeStart, today, "day"),
      fetchReport(hourlyQueryStart, today, "hour"),
    ]);

    const rowsSinceDay = (start: string) =>
      dailyRows.filter(
        (row) => typeof row.day === "string" && row.day >= start,
      );
    const recentHourlyRows = hourlyRows.filter((row) => {
      if (typeof row.hour !== "string") {
        return false;
      }

      const bucketStart = Date.parse(`${row.hour}:00:00Z`);
      return Number.isFinite(bucketStart) && bucketStart >= twentyFourHourCutoff.getTime();
    });

    const value: UsageOutput = {
      generatedAt: now.toISOString(),
      accountScope: "team",
      periods: [
        aggregate(dailyRows, "all_time", allTimeStart, today),
        aggregate(
          rowsSinceDay(thirtyDayStart),
          "past_30_days",
          thirtyDayStart,
          today,
        ),
        aggregate(
          rowsSinceDay(sevenDayStart),
          "past_7_days",
          sevenDayStart,
          today,
        ),
        aggregate(
          recentHourlyRows,
          "past_24_hours",
          twentyFourHourCutoff.toISOString(),
          now.toISOString(),
        ),
      ],
      note: "Usage is team-wide and includes both system and BYOK requests. totalCostUsd is charged by Vercel and is zero for BYOK inference; marketCostUsd estimates provider list-price usage across both. The 24-hour value uses available UTC hourly buckets and may omit part of the first hour. Reports can lag by several minutes.",
    };

    cache = { expiresAt: now.getTime() + CACHE_TTL_MS, value };
    return value;
  },
});
