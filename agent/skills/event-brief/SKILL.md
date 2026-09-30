---
name: event-brief
description: Reconcile event or company details across Slack, Notion and meeting notes into a sourced brief, including Startup Week schedules, recruiting preferences and missing confirmations.
---

Start with the user's event, year, and requested fields. Retrieve the owning
Notion database or calendar when available. Use focused public Slack searches
and thread follow-ups for recent decisions and integration messages such as
Tally confirmations. Read relevant Granola notes when meeting decisions matter.
Use the existing guarded tools and current user's Slack identity.

Extract only claims present in retrieved sources. Keep a permalink for each
record. Pass them to `reconcile_records`. Use separate keys for separate events,
years, companies and dates. Merge aliases only when source evidence establishes
they identify the same entity. A company dinner and fireside are two events.

Present dates, local times/timezone, locations, format, owner and status as
requested. Add audience, roles, sponsorship and tier when relevant. Preserve
disagreements. A recent mention does not automatically override the owning
record. Do not equate confirmed attendance, a tier selection, or a blank CRM
payment field with a verified payment. Payment verification needs an actual
payment record, which this workflow does not provision.

The comparison tool checks supplied claims; it does not retrieve or verify
them. Every answer must state its source coverage. For a request for all events
or companies, complete the authoritative source's pagination and declared
date scope if possible. Slack search alone remains a subset. If pagination or
provider access is incomplete, label the list incomplete and name the gap.

This workflow produces a brief. If the user requests task updates, use the
meeting-actions skill and the existing exact-call approval gate. Do not create
new databases or add fields merely to make the brief easier to produce.
