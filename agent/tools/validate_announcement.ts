import { defineTool } from "eve/tools";
import { announcementSchema, validateAnnouncement } from "../lib/announcement-validation.js";
import { slackCaller } from "../lib/slack-policy.js";

export default defineTool({
  description: "Validate supplied announcement details using the current clock: required fields, real calendar dates, weekday, publication-relative wording, IANA timezone, DST gaps/ambiguity, overnight end times and safe V1 tracking links. Computes locally without fetching links, publishing, or scheduling. Use with v1-event-announcements.",
  inputSchema: announcementSchema,
  execute(input, ctx) { slackCaller(ctx); return validateAnnouncement(input); },
});
