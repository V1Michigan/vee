import { sharedAuth } from "../lib/shared-auth.js";
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
    "Read V1's shared Google Calendars, find events and availability, suggest meeting times, and—after confirmation—create, update, delete, or respond to calendar events.",
  tools: { allow: allowedTools },
  auth: sharedAuth("google-calendar"),
});
