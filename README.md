# Vee

Vee is V1 at Michigan's internal Slack agent, built with the Eve framework and
hosted on Vercel.

Vee responds to Slack mentions and direct messages, keeps durable conversation
state within Slack threads, can use Eve's built-in tools, and connects to the
V1 team's shared Notion workspace and its own GitHub repository through MCP.
Its identity and behavior are defined in `agent/instructions.md`; model
selection lives in `agent/agent.ts`; and the Slack channel is configured in
`agent/channels/slack.ts`.

GitHub access is restricted to reading `V1Michigan/vee`, filing issues, and
creating changes on `vee/*` branches for draft pull requests. Vee is instructed
never to push to `main`, merge its own pull requests, alter repository settings,
manage secrets, run workflows, or publish releases. GitHub branch protection is
the enforcement boundary for `main`.

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

GitHub uses the same shared-grant model. Authorize the `github/vee-github`
connector once with access limited to the `V1Michigan/vee` repository.
