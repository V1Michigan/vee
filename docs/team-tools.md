# Team tools

These changes extend the access-and-reliability stack. They do not bypass its
pilot gate, requester checks, private-session rules, or action approvals.

## Agent traces

Ask Vee: **Show the trace for your last answer.** `inspect_agent_run` returns
the last three operational traces in the current conversation. An optional
`turnKey` selects one of the last six turns. Each trace holds up to 200 events
and explicitly reports truncation. This adds no model calls or external store.
It records model steps, tool names, allowlisted service operations, waits, safe
failure codes, and reported token/cost values. It excludes prompts, reasoning,
messages, tool payloads, OAuth URLs, credentials, and raw error messages.
Timestamps include human and provider waits. Missing usage stays missing.

For the web viewer, use the project's authenticated **Observability → Agent
Runs** page in Vercel. Eve already emits the workflow tags for it. Verify access
with a V1 project member and copy that page's URL into `VEE_AGENT_RUNS_URL`.
The tool then supplies the viewer link alongside its conversation-local trace.
It never creates public/shared trace links or changes project permissions.
Use the timestamps and tool sequence to find the corresponding native run.

Native Agent Runs and `inspect_agent_run` are different data surfaces. Vercel
can retain full durable workflow payloads independently of Eve's OpenTelemetry
`recordInputs` / `recordOutputs` settings. Keep access limited to designated
operators and review retention before using that viewer with private sessions.
Vee's new operational trace remains content-free in every session.

The installed Eve docs describe Agent Runs as team-gated. The newer
[Vercel announcement](https://vercel.com/changelog/eve-agent-observability)
documents an automatic viewer. Availability must be verified in V1's account;
do not assume an empty or missing tab means the agent did not execute.
No new observability vendor, paid plan, or custom dashboard is required by this
change. The existing OpenTelemetry configuration remains portable.

## Acceptance checks

- Ask for a trace after a success, a provider failure, and a denied approval.
- Confirm the tool sequence and usage match the run, including sign-in waits.
- Confirm another conversation cannot be selected by passing a session ID.
- Confirm private source text, authorization URLs, and credentials are absent.
- Verify the native viewer requires project access and has suitable retention.

Live checks remain part of the controlled pilot. Unit fixtures do not establish
that the Vercel viewer is enabled or the Slack delivery path works.

## Connection status

Ask **Which connections work right now?** or **Check my Slack connection.**
`check_connections` performs the same fixed, read-only probes as the operator
CLI, with at most two services in flight. It derives the Slack subject from the
verified requester. Users cannot provide another identity, query, or endpoint.
The report distinguishes credential, identity, handshake, and retrieval stages
and includes a service-specific recovery step. It never begins OAuth consent.

Private DM sessions can check their owner's public Slack grant. They cannot
probe other providers after requesting private context. The journal report
checks environment presence only, labels connectivity as untested, and never
claims or deletes a write-attempt key. Provider checks add network calls only
when requested. They do not add model calls, polling, or scheduled work.

## Event briefs and task proposals

- **Reconcile Startup Week's calendar with the confirmations in Slack.** The
  `event-brief` skill retrieves relevant sources on demand and uses
  `reconcile_records` to group exact entity keys, deduplicate repeated source
  links, and expose conflicting or missing fields. Separate events and years
  remain separate. No source wins merely because its message is newer.
- **Turn this meeting's action items into updates for this Notion task DB.**
  The `meeting-actions` skill reads the destination and uses `plan_team_tasks`
  to compare exact titles, preserve unspecified fields, show proposed changes,
  and flag missing owners/dates and ambiguous matches. Existing action approval
  and the durable write journal still control every actual update.

Both computation tools operate on extracted candidates. Their output is not
independent evidence that the extraction is correct. They cannot prove full
source coverage or absence of similarly named duplicates. Every proposal
requires source review and a fresh destination check before writes. They make
no external calls, add no model calls, and install no scheduled workflows.

Validate with conflicting event times, duplicate Tally links, two events for
one company, an unspecified owner, a changed destination row, and a partially
read task database. Verify existing schema and values survive approved updates.

## Announcement drafts

Ask **Draft a Slack announcement for this event** or explicitly request
`v1-event-announcements`. The packaged skill adapts the team-authored work from
[PR #14](https://github.com/V1Michigan/vee/pull/14), preserving channel-specific
voice guidance in an on-demand reference. The older PR should not also be merged
unchanged, because that would install a second copy with a conflicting identity.

`validate_announcement` checks required fields, dates and weekdays, intended
publication date, IANA timezone, DST gaps and repeated hours, overnight end
dates, and V1 tracking links. Use 24-hour times and explicit years. The clock is
read locally. Ambiguous times require an explicit UTC offset. Existing tracking
and URL fragments survive; external links are left unchanged. Historical style
examples are never current event evidence. Drafting does not publish or schedule.

Try a wrong weekday, a missing location, an overnight event, and a post scheduled
for a different day from drafting. Check that unresolved details are flagged,
the team voice fits the selected channel, and no messages are sent elsewhere.

## Why this scope

The selected tools follow observed requests in V1's public Slack channels:
[trace visibility](https://v1michigan.slack.com/archives/C09BXNH1PL0/p1786333014054279),
[connection status](https://v1michigan.slack.com/archives/C0BRLL1ELT1/p1790647443199159),
[event reconciliation](https://v1michigan.slack.com/archives/C0BRLL1ELT1/p1789413878368239),
[task updates](https://v1michigan.slack.com/archives/C033MBHJNR5/p1789661860103209),
and [announcement drafting](https://v1michigan.slack.com/archives/C0BRLL1ELT1/p1789937189295089).
This is a targeted sample, not a census of team needs.

Stripe payment links, reminders, surveys, attachment ingestion and institutional
memory are separate increments. The current stack adds no payment connector,
scheduled model work, indexing or automatic pre-search. Computation tools make
no network calls. Skills add context only when loaded, and normal retrieval and
drafting still consume the [selected model's](model-routing.md) tokens. Measure
those costs in the existing turn metrics instead of assuming zero cost for an
entire workflow.
