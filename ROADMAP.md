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

1. Reconcile Startup Week records against authoritative form/CRM data, including
   duplicates, pagination, and source attribution.
2. Add dedicated task-creation workflows with owners, dates, duplicate checks,
   destination constraints, and explicit approval.
3. Add opt-in reminders with stop conditions and duplicate prevention.
4. Design institutional memory with source permissions, retention, correction,
   and deletion rules before implementing it.
5. Evaluate model changes using observed task quality, cost, and latency.
6. Restore web search, public URL fetching, or delegation only after they
   preserve destination, private-session, and action boundaries.

There is no background summarization, indexing, automatic pre-search, scheduled
model work, dedicated reconciliation, or institutional memory in this release.
