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

## Development

```bash
pnpm install
pnpm dev
```

## Verification

```bash
pnpm typecheck
pnpm build
```

Deploy with Eve after linking the project and provisioning the Slack connector:

```bash
vercel link
vercel env pull
pnpm exec eve deploy
```

The first person to use Notion from Slack must authorize Vee with the shared V1
Notion team account. That grant is then reused by Vee across Slack users.

GitHub uses the same shared-grant model. Authorize the `github/vee`
connector once with access limited to the `V1Michigan/vee` and
`V1Michigan/website-v2` repositories.

Slack search and Granola use per-user authorization. Slack search requests only
`search:read.public`, so Vee cannot search private channels or direct messages.
Granola follows each user's active workspace and note permissions; its MCP
server does not support a shared service account.

Google Calendar also uses per-user authorization and follows the calendars and
permissions of each connected Google account. Vee can read calendars, search
events, check availability, and suggest times. Calendar writes are available,
but its instructions require explicit confirmation of the exact event details
before creating, updating, deleting, or responding to an event.

The Calendar connection uses Google's official remote MCP server at
`https://calendarmcp.googleapis.com/mcp/v1`. Google currently marks it as a
Developer Preview. Initial setup requires enabling the Google Calendar API and
Google Calendar MCP API in a Google Cloud project, configuring the OAuth consent
screen, and completing the `calendarmcp.googleapis.com/google-calendar`
connector setup in Vercel Connect.

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
