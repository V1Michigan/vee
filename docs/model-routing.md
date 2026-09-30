# Simple model routing

Vee chooses one model for each new Slack turn. Routine requests use
`openai/gpt-5.6-luna`. Explicit deep requests and two narrow workflow rules use
`openai/gpt-5.6-sol` with low reasoning effort. Both routes use OpenAI through
the existing AI Gateway connection and retain the same tools, requester
credentials, private-session restrictions, and action approvals.

## Using the router

Start the request with a mode after mentioning Vee, or at the start of a DM:

| Request | Selection |
| --- | --- |
| `@Vee Which connections work?` | Standard, Luna. |
| `@Vee deep: Review the event plan` | Deep, Sol. |
| `@Vee standard: Reconcile conflicting event records` | Standard, Luna. |
| `@Vee Please think deeply about our task dependencies` | Deep, Sol. |
| `@Vee Reconcile event records across Slack and Notion` | Deep, Sol. |
| `@Vee Review the architecture of the task integration` | Deep, Sol. |

Modes apply to one turn. A later request chooses again, including another
person's reply in the same public thread. A follow-up such as “thanks” returns
to standard. OAuth and approval continuations keep the original turn's model.
Mode prefixes change computation, not permissions or whether a write needs
approval.

Automatic deep selection is deliberately limited:

- Requests beginning with reconcile, cross-check, compare, or resolve select
  deep when they concern records, events, schedules, companies, tasks, sponsors,
  or attendance and name at least two of Slack, Notion, Granola, and Tally.
  Explicitly conflicting or inconsistent records also qualify.
- Requests beginning with design, review, evaluate, or compare select deep when
  they concern architecture.

Common polite prefixes are accepted. Other requests remain standard. These
are routing rules, not a general difficulty classifier. Use `deep:` when a
difficult request does not match them. Use `standard:` to override a rule.

Only the first line of the verified triggering Slack message is classified.
Quoted examples, code blocks, links, attachments, retrieved records, and other
thread messages cannot supply routing directives. The classifier bounds input
size and falls back to standard for oversized requests. It neither stores nor
logs the text it examines.

## Configuration and rollout

`VEE_MODEL_ROUTING` controls new turns:

| Value | Behavior |
| --- | --- |
| `auto` or unset | Explicit modes plus the two workflow rules. |
| `explicit` | Explicit `deep:` or “think deeply” only. |
| `off` | Luna for every new turn. |
| Any other value | Luna with `invalid_configuration` in routing diagnostics. |

The existing Slack pilot allowlist still gates access. This change does not
enable broader rollout. Setting `off` is the router rollback. An active or
paused turn keeps its durable selection; the setting applies when a new turn
starts. A provider failure never causes this router to restart a turn, switch
models, or repeat a tool call.

The model registry is `agent/lib/model-routing.ts`. It fixes two model IDs,
their context windows, and the deep reasoning setting. User text cannot select
arbitrary models, providers, budgets, or fallback chains. Both model IDs and
their 1,050,000-token context windows were checked against the
[public AI Gateway catalog](https://ai-gateway.vercel.sh/v1/models) on
2026-09-30. Catalog presence does not prove this project's provider access.

The implementation uses the installed Eve 0.24.6 `defineDynamic` API, with a
static Luna fallback and a `turn.started` resolver. Newer upstream Eve versions
have a different dynamic-model contract. Review that API when upgrading. The
existing organizational connection grants remain unchanged.

## Diagnostics and cost

“Show your agent trace” now includes the selected profile, model, policy version,
reason, and reasoning setting for each recorded turn. The `vee.turn` metric
schema is version 2. Its `model` field follows the durable route and is `null`
when attribution is unavailable. `modelAttribution` is `selected` or `unknown`.
No message text, tool payload, credentials, or raw error is added to telemetry.

Eve 0.24.6's public step events expose a Gateway generation ID but no served
model ID. These fields describe Vee's selection, not a claim about the model
actually served after any team-level Gateway rewrite. Use the Gateway request
record to verify the served model during the pilot. Missing usage and cost
remain unknown, not zero. Replayed events retain one routing decision and do
not duplicate recorded usage.

The router makes no classifier-model call, pre-search, background evaluation,
or automatic retry. Sol calls use a higher-priced model. Low reasoning effort
is a setting, not a hard token or dollar cap. This first version does not add a
per-turn spending cap. Switching models can lose prompt-cache reuse across
turns. Measure complete-task tokens, retries, cost, and latency before claiming
savings or improved quality. The normal SDK/runtime retry behavior is unchanged.

## Local verification

```sh
pnpm routing:check
pnpm test
pnpm typecheck
pnpm build
```

`routing:check` evaluates the checked-in synthetic request corpus and exits
nonzero on a profile or reason mismatch. It does not load credentials or call
a provider. The unit suite also drives Vee's actual exported resolver and Slack
ingress helper with isolated mocked Eve state. It checks requester changes,
replay/resume inputs, private restrictions, missing state, configuration changes,
and trace redaction. These checks do not simulate a real Slack callback or
prove that either model completes the underlying task well.

## Operator pilot

Complete the existing [release checklist](rollout.md) as well as these checks:

1. Verify Luna and Sol tool access in this Vercel project and confirm that its
   Gateway rules preserve the intended model and OpenAI provider restrictions.
2. Set `VEE_MODEL_ROUTING=explicit`. Have the two pilot users issue the same
   sourced, read-only task with `standard:` and `deep:` in separate test turns.
   Keep private examples in the authorized user's DM.
3. Inspect the trace and Gateway request record for each turn. Check selected
   and served models, citations, completeness labels, tool correctness, token
   usage, and total latency. Record task quality separately from “turn completed.”
4. Have user A request deep and user B ask a routine question in the same public
   thread. Confirm B receives standard and still uses B's own Slack grant.
5. Pause a deep turn for OAuth and another for exact-action approval. Resume
   each and verify that the model stays selected while account, requester,
   changed-argument, and approval-denial checks still apply. Use the existing
   interrupted-write check to confirm that no router path retries the write.
6. Set `auto`. Try both recognized workflows and routine requests. Confirm
   that `standard:` overrides automatic deep selection and private retrieval
   remains confined to the owner's DM.
7. Set `off` and issue a new `deep:` request. Confirm standard selection with
   `routing_disabled`. Restore the desired setting only after checking results.

Pilot results are pending. Offline routing fixtures, mocked state tests, and a
successful build are separate evidence from live provider behavior and quality.

## Later extensions

Consider broader heuristics, a learned classifier, or one bounded escalation
only after reviewing misroutes and complete-task cost. A future escalation must
distinguish reasoning failures from authorization/configuration failures and
must preserve the original action journal. Keep model choices, policy versions,
and regression cases reviewable in focused commits.
