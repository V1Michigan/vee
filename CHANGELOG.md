# Changelog

## Unreleased

### Added

- Conversation-local operational trace inspection and optional authenticated
  Vercel Agent Runs navigation, without exporting messages or tool payloads.
- On-demand connection status inside Slack, with current-requester checks and
  stage-specific recovery guidance.
- Sourced event comparisons and Notion task proposals that preserve conflicts,
  missing assignments, destination values, and existing action approvals.
- The team's event-announcement skill, adapted from PR #14, with deterministic
  calendar, timezone, DST, publication-date, and tracking-link validation.
- Per-user public Slack OAuth, verified requester/account matching, and optional
  private-channel consent confined to the requester's DM session.
- Guarded Slack search and channel/thread reads with integration messages,
  source permalinks, pagination, and explicit incomplete-coverage labels.
- Runtime service/tool allowlists and GitHub repository, branch, issue-create,
  and draft-PR restrictions.
- Exact-call approvals bound to the original requester, with complete Slack
  review payloads and a durable Redis REST claim before each write attempt.
- Read-only provider diagnostics that distinguish credential availability,
  identity, MCP initialization, and successful retrieval.
- Content-free per-turn token, latency, tool failure, and completion metrics.
- A closed pilot gate, personal Slack reconnect flow, and operator rollout
  checklist.

### Changed

- Retire shared Slack authorization through the administrator script. Keep the
  old grant remotely for recovery without a runtime fallback.
- Keep existing organizational identities for Notion, Granola, Calendar, GitHub,
  and AgentMail. Use guarded retrieval and actions in place of raw connections.
- Select authoritative sources based on the question. Remove mandatory Notion
  searches and automatic re-retrieval of evidence already relevant to the turn.
- Keep private Slack context in its DM session and prevent exports through
  other providers or external actions.
- Disable unguarded shell, child-agent, and public web tools for this release.
- Keep GPT-5.6 Luna and OpenAI-only AI Gateway routing.

### Fixed

- Preserve integration-generated Slack records such as Tally confirmations.
- Bound transient read retries, honor Retry-After, and never automatically retry
  a write with an uncertain outcome.
- Prevent shared Notion search from bypassing Slack isolation via connected
  sources.
- Report safe, distinct failure codes instead of raw provider error details.
- Avoid claiming a complete inbox inventory from AgentMail's first page.

### Rollout requirements

- Two V1 users must validate authorization, privacy, retrieval, and approvals.
- The durable write-attempt store must be configured before mutations work.
- Missing shared grants and Calendar configuration must be provisioned.
- No background indexing, summarization, scheduled model work, reconciliation,
  proactive reminders, or institutional memory is introduced.

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
