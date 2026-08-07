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
