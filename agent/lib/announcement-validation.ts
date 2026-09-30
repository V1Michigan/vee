import { z } from "zod";
import { calendarDateSchema } from "./task-planning.js";
import { sourceUrlSchema } from "./record-reconciliation.js";

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm.");
const offsetSchema = z.string().regex(/^[+-](?:0\d|1[0-4]):[0-5]\d$/);
const text = z.string().trim().min(1).max(500);
export const announcementSchema = z.object({
  channel: z.enum(["slack", "linkedin", "instagram", "x"]), kind: z.enum(["event", "recruiting"]),
  title: text.optional(), description: text.optional(), audience: text.optional(), location: text.optional(), link: sourceUrlSchema.optional(),
  timezone: z.string().max(80).default("America/Detroit"), publicationDate: calendarDateSchema.optional(),
  eventDate: calendarDateSchema.optional(), startTime: timeSchema.optional(), endTime: timeSchema.optional(), endDate: calendarDateSchema.optional(),
  deadlineDate: calendarDateSchema.optional(), deadlineTime: timeSchema.optional(),
  startOffset: offsetSchema.optional(), endOffset: offsetSchema.optional(), deadlineOffset: offsetSchema.optional(),
  weekday: z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]).optional(),
  relativeWord: z.enum(["today", "tonight", "tomorrow"]).optional(),
}).strict();
type Input = z.infer<typeof announcementSchema>;

function formatter(timezone: string) {
  if (timezone !== "UTC" && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(timezone)) throw new Error("invalid_timezone");
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, calendar: "gregory", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
function localStamp(instant: number, fmt: Intl.DateTimeFormat): string {
  const p = Object.fromEntries(fmt.formatToParts(instant).map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function offsetMinutes(offset: string): number {
  return (offset.startsWith("-") ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4)));
}

/** Resolve a wall clock by round-trip, including DST gaps and repeated hours. */
export function resolveLocalTime(date: string, time: string, timezone: string, offset?: string): number[] {
  const fmt = formatter(timezone);
  const wall = `${date}T${time}`;
  const nominal = Date.parse(`${wall}:00Z`);
  const offsets = new Set<number>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const instant = nominal + hours * 3_600_000;
    offsets.add((Date.parse(`${localStamp(instant, fmt)}:00Z`) - instant) / 60_000);
  }
  return [...offsets].filter((minutes) => offset === undefined || minutes === offsetMinutes(offset))
    .map((minutes) => nominal - minutes * 60_000).filter((instant) => localStamp(instant, fmt) === wall).sort((a, b) => a - b);
}

export function validateAnnouncement(input: Input, now = new Date()) {
  const value = announcementSchema.parse(input);
  const issues: string[] = [];
  const warnings: string[] = [];
  const missing = ["title", "description", "link", ...(value.kind === "event" ? ["eventDate", "startTime", "endTime", "location"] : ["deadlineDate", "audience"])]
    .filter((field) => !value[field as keyof Input]);
  let today: string | null = null;
  try { today = localStamp(now.getTime(), formatter(value.timezone)).slice(0, 10); }
  catch { issues.push("invalid_timezone"); }
  const publicationDate = value.publicationDate ?? today;
  if (today && publicationDate && publicationDate < today) issues.push("publication_date_in_past");
  const date = value.kind === "event" ? value.eventDate : value.deadlineDate;
  const weekday = date ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(new Date(`${date}T12:00:00Z`)) : null;
  if (value.weekday && weekday && value.weekday !== weekday) issues.push("weekday_mismatch");
  if (date && publicationDate && date < publicationDate) issues.push("date_before_publication");
  if (value.relativeWord && date && publicationDate) {
    const expected = new Date(`${publicationDate}T12:00:00Z`);
    if (value.relativeWord === "tomorrow") expected.setUTCDate(expected.getUTCDate() + 1);
    if (expected.toISOString().slice(0, 10) !== date) issues.push("relative_date_mismatch");
  }
  const resolve = (label: string, date?: string, time?: string, offset?: string) => {
    if (!date || !time || !today) return null;
    const possibilities = resolveLocalTime(date, time, value.timezone, offset);
    if (!possibilities.length) { issues.push(`${label}_nonexistent_or_offset_mismatch`); return null; }
    if (possibilities.length > 1) { issues.push(`${label}_ambiguous_dst_offset_required`); return null; }
    return possibilities[0];
  };
  const start = value.kind === "event" ? resolve("start", value.eventDate, value.startTime, value.startOffset) : null;
  const end = value.kind === "event" ? resolve("end", value.endDate ?? value.eventDate, value.endTime, value.endOffset) : null;
  const deadline = value.kind === "recruiting" ? resolve("deadline", value.deadlineDate, value.deadlineTime, value.deadlineOffset) : null;
  if (start !== null && end !== null && end <= start) issues.push("end_not_after_start_specify_overnight_end_date");
  if (start !== null && start <= now.getTime()) issues.push("event_in_past");
  if (deadline !== null && deadline <= now.getTime()) issues.push("deadline_in_past");
  if (value.kind === "recruiting" && value.deadlineDate && !value.deadlineTime) warnings.push("deadline_time_unspecified_do_not_invent_midnight");
  let link = value.link ?? null;
  if (link) {
    const url = new URL(link);
    if (["v1michigan.com", "www.v1michigan.com"].includes(url.hostname)) {
      const source = value.channel === "x" ? "twitter" : value.channel;
      if (!url.searchParams.has("utm_source")) { url.searchParams.set("utm_source", source); link = url.href; }
      else if (url.searchParams.getAll("utm_source").length !== 1 || url.searchParams.get("utm_source") !== source) warnings.push("existing_utm_source_preserved_review_before_publishing");
    }
  }
  return {
    checkedAt: now.toISOString(), today, publicationDate, timezone: value.timezone, date: date ?? null, weekday,
    startUtc: start === null ? null : new Date(start).toISOString(), endUtc: end === null ? null : new Date(end).toISOString(), deadlineUtc: deadline === null ? null : new Date(deadline).toISOString(),
    link, missing, issues, warnings, readyToDraft: missing.length === 0 && issues.length === 0,
    note: "Calendar and URL structure validation only. This does not verify event facts, link availability, RSVP capacity, current company statistics, or permission to publish. Relative language uses the intended publication date. Drafting never schedules or publishes a message.",
  };
}
