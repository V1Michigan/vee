# Vee roadmap

## First release: per-user access and reliability

Implementation is in a three-PR stack: Slack access, guarded actions, then
diagnostics and rollout. Keep all three draft until the pilot passes. Merge from
the bottom upward. Retarget the next PR to main after its dependency merges and
verify that only its intended diff remains.

- [x] Per-user Slack grants and connected-account verification.
- [x] Public search in shared conversations and private opt-in in the owner's DM.
- [x] No personal/group DM retrieval, shared-grant fallback, or private export.
- [x] Source selection, integration messages, citations, and completeness limits.
- [x] Runtime tool/resource restrictions and requester-bound approvals.
- [x] Bounded read retries and durable protection against write replay.
- [x] Provider diagnostics and content-free turn metrics.
- [ ] Provision the missing provider credentials/configuration and write journal.
- [ ] Complete the two-user public-thread and DM pilot.
- [ ] Enable broader rollout only after every isolation and approval check passes.

The [operator checklist](docs/rollout.md) records the release gate. Local tests
and successful builds do not substitute for OAuth callbacks, Slack delivery,
or the live approval matrix.

## Subsequent increments

The [team-tool extension](docs/team-tools.md) implements safe conversation traces,
connection checks, sourced record comparisons, task proposals and announcement
drafting. Skills retrieve on demand; comparison tools operate on extracted
candidates. Live model routing and the source-to-approved-write workflow still
need pilot validation. The announcement diff adapts PR #14; do not also merge
its older flat skill unchanged.

1. Connect authoritative form/payment data for complete Startup Week
   reconciliation. Candidate comparisons alone do not establish completeness.
2. Validate the task proposal workflow with live Notion schemas, pagination,
   owner identities, changed rows, and exact approvals.
3. Add opt-in reminders with stop conditions and duplicate prevention.
4. Design institutional memory with source permissions, retention, correction,
   and deletion rules before implementing it.
5. Evaluate model changes using observed task quality, cost, and latency.
6. Restore web search, public URL fetching, or delegation only after they
   preserve destination, private-session, and action boundaries.

There is no background summarization, indexing, automatic pre-search, scheduled
model work, payment connector, or institutional memory in this release.
