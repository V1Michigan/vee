import { connect } from "@vercel/connect/eve";
import { defineMcpClientConnection } from "eve/connections";

const allowedTools = [
  "list_events",
  "get_event",
  "list_calendars",
  "suggest_time",
  "search_events",
  "create_event",
  "update_event",
  "delete_event",
  "respond_to_event",
];

export default defineMcpClientConnection({
  url: "https://calendarmcp.googleapis.com/mcp/v1",
  description:
    "Read the current user's Google Calendars, find events and availability, suggest meeting times, and—after confirmation—create, update, delete, or respond to calendar events.",
  tools: { allow: allowedTools },
  auth: connect({
    connector: "calendarmcp.googleapis.com/google-calendar",
    principalType: "user",
    validate: true,
    instructions:
      "Authorize Vee with the Google account whose calendars you want it to access. Calendar access is per user and follows that account's Google Calendar permissions.",
  }),
});
