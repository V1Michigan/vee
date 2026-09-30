import assert from "node:assert/strict";
import test from "node:test";
import { announcementSchema, resolveLocalTime, validateAnnouncement } from "./announcement-validation.ts";

const now = new Date("2026-09-29T16:00:00Z");
const event = (extra = {}) => ({ channel: "slack", kind: "event", title: "Example event", description: "Meet the team.", location: "Room 1", link: "https://v1michigan.com/events?ref=team#rsvp", eventDate: "2026-10-05", startTime: "18:00", endTime: "20:00", timezone: "America/Detroit", ...extra });

test("validator uses local current date, real weekday and Eastern event offsets", () => {
  const result = validateAnnouncement(event({ weekday: "Monday" }), now);
  assert.equal(result.readyToDraft, true);
  assert.equal(result.today, "2026-09-29");
  assert.equal(result.weekday, "Monday");
  assert.equal(result.startUtc, "2026-10-05T22:00:00.000Z");
  assert.equal(result.endUtc, "2026-10-06T00:00:00.000Z");
  assert.equal(validateAnnouncement(event(), new Date("2026-09-30T01:00:00Z")).today, "2026-09-29");
});

test("weekday and relative wording are checked against the publication date", () => {
  assert.ok(validateAnnouncement(event({ weekday: "Tuesday" }), now).issues.includes("weekday_mismatch"));
  const good = validateAnnouncement(event({ publicationDate: "2026-10-04", relativeWord: "tomorrow" }), now);
  assert.equal(good.readyToDraft, true);
  const bad = validateAnnouncement(event({ publicationDate: "2026-10-03", relativeWord: "tomorrow" }), now);
  assert.ok(bad.issues.includes("relative_date_mismatch"));
});

test("past dates and reversed times are rejected while explicit overnight events work", () => {
  assert.ok(validateAnnouncement(event({ eventDate: "2026-09-28" }), now).issues.includes("event_in_past"));
  assert.ok(validateAnnouncement(event({ startTime: "22:00", endTime: "01:00" }), now).issues.includes("end_not_after_start_specify_overnight_end_date"));
  assert.equal(validateAnnouncement(event({ startTime: "22:00", endTime: "01:00", endDate: "2026-10-06" }), now).readyToDraft, true);
  assert.equal(announcementSchema.safeParse(event({ eventDate: "2026-02-29" })).success, false);
  assert.equal(announcementSchema.safeParse(event({ startTime: "25:00" })).success, false);
});

test("DST gaps and repeated hours require real unambiguous instants", () => {
  assert.deepEqual(resolveLocalTime("2027-03-14", "02:30", "America/Detroit"), []);
  assert.equal(resolveLocalTime("2026-11-01", "01:30", "America/Detroit").length, 2);
  const ambiguous = event({ eventDate: "2026-11-01", startTime: "01:30", endTime: "03:00" });
  assert.ok(validateAnnouncement(ambiguous, now).issues.includes("start_ambiguous_dst_offset_required"));
  assert.equal(validateAnnouncement({ ...ambiguous, startOffset: "-04:00" }, now).startUtc, "2026-11-01T05:30:00.000Z");
  assert.equal(validateAnnouncement({ ...ambiguous, startOffset: "-05:00" }, now).startUtc, "2026-11-01T06:30:00.000Z");
  assert.ok(validateAnnouncement({ ...ambiguous, startOffset: "+01:00" }, now).issues.includes("start_nonexistent_or_offset_mismatch"));
});

test("invalid or ambiguous timezone abbreviations do not silently fall back", () => {
  for (const timezone of ["EST", "Mars/Olympus"]) {
    const result = validateAnnouncement(event({ timezone }), now);
    assert.equal(result.readyToDraft, false);
    assert.deepEqual(result.issues, ["invalid_timezone"]);
  }
  assert.equal(resolveLocalTime("2026-10-05", "18:00", "Asia/Kolkata")[0], Date.parse("2026-10-05T12:30:00Z"));
});

test("tracking preserves queries and fragments and never rewrites external links", () => {
  assert.equal(validateAnnouncement(event(), now).link, "https://v1michigan.com/events?ref=team&utm_source=slack#rsvp");
  assert.equal(validateAnnouncement(event({ channel: "x", link: "https://v1michigan.com/join" }), now).link, "https://v1michigan.com/join?utm_source=twitter");
  const original = "https://v1michigan.com/join?utm_source=ross#apply";
  const preserved = validateAnnouncement(event({ link: original }), now);
  assert.equal(preserved.link, original);
  assert.ok(preserved.warnings.includes("existing_utm_source_preserved_review_before_publishing"));
  for (const link of ["https://luma.com/example#rsvp", "https://v1michigan.com.evil.test/", "https://other.example/?ref=team"]) assert.equal(validateAnnouncement(event({ link }), now).link, link);
});

test("missing details are collected together and recruiting deadlines do not invent midnight", () => {
  const incomplete = validateAnnouncement({ channel: "slack", kind: "event", timezone: "America/Detroit" }, now);
  assert.equal(incomplete.readyToDraft, false);
  assert.deepEqual(incomplete.missing, ["title", "description", "link", "eventDate", "startTime", "endTime", "location"]);
  const recruiting = validateAnnouncement({ channel: "linkedin", kind: "recruiting", title: "Apply", description: "Build with us", audience: "Students", deadlineDate: "2026-10-05", link: "https://v1michigan.com/join", timezone: "America/Detroit" }, now);
  assert.equal(recruiting.readyToDraft, true);
  assert.equal(recruiting.deadlineUtc, null);
  assert.ok(recruiting.warnings.includes("deadline_time_unspecified_do_not_invent_midnight"));
});
