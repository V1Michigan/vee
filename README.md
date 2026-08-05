# Vee

Vee is V1 at Michigan's internal Slack agent, built with the Eve framework and
hosted on Vercel.

Vee responds to Slack mentions and direct messages, keeps durable conversation
state within Slack threads, can use Eve's built-in tools, and connects to the
V1 team's shared Notion workspace through MCP. Its identity and behavior are
defined in `agent/instructions.md`; model selection lives in `agent/agent.ts`;
and the Slack channel is configured in `agent/channels/slack.ts`.

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
