# Changelog

## Unreleased

### Added

- Shared GitHub MCP access for Vee to file issues and prepare draft pull
  requests against its own repository.
- Guardrails that restrict Vee to `V1Michigan/vee`, require `vee/*` branches,
  and prohibit direct changes to `main`, self-merges, settings, secrets,
  workflows, and releases.
- Per-user search across public Slack channels using Slack's official MCP
  server and the `search:read.public` scope.
- Per-user Granola access for meeting notes, summaries, action items, and
  transcripts through Granola's official MCP server.
- Notion-first guidance for general V1 questions, with multi-source synthesis
  across Notion, Slack, and Granola when useful.
- A read-only, BYOK-aware tool for reporting team-wide Vercel AI Gateway
  requests, token usage, and costs across four time windows.
- Retrieval-first answer guidance requiring source verification, including
  Notion for V1 facts, Granola for meetings, Slack for team context, GitHub for
  repository questions, and web search for external information.

### Fixed

- Use the AI SDK's runtime-aware OIDC authentication for AI Gateway reports
  instead of expecting a build-time token in the Function environment.
- Match Vee's GitHub connection to the attached `github/vee` connector so its
  shared repository authorization can be resolved at runtime.
- Extend Vee's GitHub scope to `V1Michigan/website-v2` and distinguish
  self-feedback from explicitly requested website issues.
- Switch Vee from DeepSeek V4 Flash to GPT-5.6 Luna and restrict AI Gateway
  routing to Azure so the team's Azure BYOK credential is preferred.

## [0.0.1] - 2026-08-04

### About this release

Vee's first release establishes its Slack identity and gives the V1 team shared
access to its Notion workspace from Slack.

### Added

- A shared Notion MCP connection for searching, reading, creating, and updating
  team content.
- Project documentation for local development, verification, and deployment.

### Changed

- Standardized the assistant and package identity as Vee.

### Action required

- Authorize the Notion connection once using the shared V1 Notion team account.

### Verification

- TypeScript typecheck.
- Eve production build.
