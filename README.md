# Vee

Vee is V1 at Michigan's internal Slack agent, built with the Eve framework and
hosted on Vercel.

Vee responds to Slack mentions and direct messages, keeps durable conversation
state within Slack threads, can use Eve's built-in tools, and connects to the
V1 team's shared Notion workspace, public Slack history, Granola meeting notes,
Google Calendar, and the Vee and website GitHub repositories through MCP. Its
identity and behavior are defined in `agent/instructions.md`; model selection
lives in `agent/agent.ts`; and the Slack channel is configured in
`agent/channels/slack.ts`.

Vee uses `openai/gpt-5.6-luna` through AI Gateway, with routing restricted to
the OpenAI provider. This bypasses the team's Azure BYOK credential and uses AI
Gateway's Vercel-managed system credentials.

Vee is retrieval-first for factual answers. It must verify claims with at least
one relevant source: Notion at minimum for V1 facts, Granola for meetings, Slack
for team discussions and recent operational context, GitHub for repository
questions, and web search for external facts. It names its sources and states
when retrieval cannot verify an answer instead of guessing.

GitHub access is restricted to `V1Michigan/vee` (Vee's own code) and
`V1Michigan/website-v2` (V1 at Michigan's website), including filing issues and
creating changes on `vee/*` branches for draft pull requests. Vee may suggest
filing self-feedback in `V1Michigan/vee`; it files website improvement issues
only when explicitly requested. Vee is instructed never to push to `main`,
merge its own pull requests, alter repository settings, manage secrets, run
workflows, or publish releases. GitHub branch protection is the enforcement
boundary for `main`.

## Current features

These capabilities are implemented in the code. Connected services require the
shared credentials below; this list is not a claim that every integration is
currently authorized or deployed.

- **Slack assistant:** responds to mentions and direct messages, with conversation
  context retained within Slack threads.
- **Source-backed answers:** searches relevant sources, cites or names evidence,
  and explains when a claim cannot be verified.
- **Notion:** searches, reads, creates, and updates V1 team documentation.
- **Public Slack search:** retrieves discussions and decisions from public
  channels using the designated V1 account. No private-channel or DM search.
- **Meeting context:** searches Granola notes, summaries, action items, and
  transcripts accessible to Vee's designated account.
- **Team calendar:** finds events and availability, suggests meeting times, and
  can create, update, delete, or respond to events after confirmation of the
  exact event details. It does not connect each person's private calendar.
- **AgentMail:** lists Vee's inboxes, reads/searches messages and threads, and
  creates or edits drafts. Creating inboxes, sending, replying, forwarding, and
  sending drafts require confirmation under Vee's instructions. AgentMail does
  not automatically contain V1's existing Gmail or listserv history.
- **GitHub:** reads the Vee and website repositories, searches/files issues,
  prepares changes on `vee/*` branches, and opens draft pull requests. Branch
  and approval rules are agent instructions; repository permissions and branch
  protection provide enforcement.
- **AI cost reporting:** reports team-wide AI Gateway requests, tokens, Vercel
  charges, and provider list-price usage for four time windows. This is not a
  Vee-only bill or a remaining-credit balance.
- **Centralized connections:** reuses V1 credentials across Slack users, with
  administrator-only setup commands and no personal OAuth prompts in chat.
  Missing credentials produce a setup error instead of a sign-in loop.

### Connection status checked September 5, 2026

- **AgentMail:** shared credential available; a live read-only inbox listing
  succeeded after administrator consent.
- **GitHub:** shared app credential available; repository tool access still
  needs a downstream check.
- **Notion, public Slack search, Granola:** shared authorization still required.
- **Google Calendar:** configured in code, but its connector was not found in
  the linked Vercel project and must be provisioned.

Run `pnpm connections:check` for current credential status. A browser login to
Notion or AgentMail alone does not authorize Vee; the Vercel Connect consent
flow must complete. Production status depends on deployment and verification.

## Upcoming features

Proposed priorities based on V1's operating workflows. These are not implemented
and are not commitments to release dates. Existing tools can help draft parts
of these workflows, but Vee has no dedicated end-to-end automation for them yet.

1. **Finish shared-service setup:** connect the remaining services, verify
   retrieval from two Slack users, and add connection health reporting.
2. **Meeting and Slack commitments to Linear:** propose tasks with owners,
   dates, and source links; check for duplicates; create approved tickets in
   existing projects and cycles. Requires a Linear integration.
3. **Event readiness checks:** compare confirmed event details against the
   Ship-It runbook, flag missing owners/assets/links, and prepare event copy.
   Add scoped Luma, Tally, Pitch, and Retool actions after the read-only pilot.
4. **Onboarding checklists:** instantiate existing Notion templates with a buddy,
   role-specific resources, and Day 1/3/5/7/14 milestones.
5. **Reimbursement triage:** check required fields and receipts, flag possible
   duplicates, and prepare a private review queue. Approval and payment stay
   with authorized people.
6. **Marketing preparation:** draft channel-specific copy, validate links and
   UTM parameters, and check readiness against the existing content calendar.
   Publishing requires approval and additional integrations.
7. **Startup Week follow-through:** track company owners and next actions,
   draft outreach, and check deliverables using the existing CRM. Real email
   history requires verified mailbox routing or an additional connection.
8. **Opt-in reminders and ops digests:** surface overdue commitments and
   approaching deadlines, with owners, stop conditions, and duplicate prevention.
   No dedicated scheduled ops workflows are configured today.
9. **Cost and reliability controls:** measure cost per completed workflow,
   evaluate model quality on real tasks, and route harder requests to a stronger
   model only when useful. No automatic model routing or per-workflow budget
   enforcement exists yet.

## Development

```bash
pnpm install
pnpm dev
```

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
```

Deploy with Eve after linking the project and provisioning the Slack connector:

```bash
vercel link
vercel env pull
pnpm exec eve deploy
```

## Shared connections

All MCP connections use centrally managed credentials. Slack users are never
asked to connect a personal account. Missing or revoked credentials fail with
an administrator setup message; they do not start a consent flow in Slack.

GitHub uses the app installation limited to V1Michigan/vee and website-v2.
Notion and AgentMail retain their existing fixed shared OAuth identities.
Slack search, Calendar, and Granola now use designated V1 OAuth identities.
These remain standard provider OAuth grants, but an administrator provisions
them outside chat. This does not turn user-only provider APIs into app APIs.

With the Vee project linked and fresh local Vercel credentials:

```bash
pnpm connections:check
pnpm connections:authorize agentmail
pnpm connections:authorize notion
pnpm connections:authorize slack-search
pnpm connections:authorize google-calendar
pnpm connections:authorize granola
```

Each authorize command prints a short-lived consent link. Complete it using the
designated V1 account, then run the check again. The commands never print tokens.
An existing shared Notion or AgentMail grant is reused; previous personal Slack,
Calendar, and Granola grants are not reused. GitHub app setup is done in Vercel
Connect. A successful credential check does not verify downstream tool access.
After provisioning, build/deploy and test read-only retrieval in each service
from two different Slack users; neither should see a sign-in link.

Only connect accounts whose accessible data can be shared with Vee's users.
Provider permissions are the access boundary: restrict Notion pages, Calendar
sharing, AgentMail organization membership, and Granola notes accordingly.
Slack search requests only search:read.public and requires a designated user
OAuth grant; the Slack channel bot credential cannot replace it. Calendar now
means V1's team schedule, not each requester's personal schedule. Granola MCP
still authenticates a designated account; it is not the Granola workspace API
and does not automatically include every member's notes. Leave it unprovisioned
until an appropriate team account is available, or use shared notes in Notion.

The Calendar connector must first be provisioned in Vercel Connect with Google's
Calendar API and Calendar MCP API enabled. Shared credentials must be installed
before deployment to avoid losing access during migration. Confirmation rules
for sending mail and modifying events still apply. Requesters retain their Slack
identity; sharing credentials does not grant them administrator privileges.

## AI Gateway usage reporting

Vee's `check_ai_gateway_usage` tool uses Vercel's Custom Reporting API to show
team-wide AI Gateway activity for all time, the past 30 days, the past 7 days,
and the past 24 hours. Each period includes request volume, token usage, the
amount charged through Vercel, and market-price usage across both system and
BYOK credentials.

On Vercel, the tool uses the automatically provided `VERCEL_OIDC_TOKEN`. For
local development, add a team AI Gateway key:

```bash
AI_GATEWAY_API_KEY=
```

Custom Reporting currently requires a Pro or Enterprise Vercel team. Reports
can lag by several minutes. The tool caches results for five minutes and makes
two reporting queries when the cache is cold. Set
`AI_GATEWAY_USAGE_START_DATE=YYYY-MM-DD` only if the default all-time starting
date of `2020-01-01` needs to be changed.
