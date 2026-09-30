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
