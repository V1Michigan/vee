# Vee

Vee is V1 at Michigan's Slack assistant, built with Eve and hosted on Vercel.
The first release uses per-user Slack authorization and guarded access to the
team's other services. Routine requests use `openai/gpt-5.6-luna`. The
[simple router](docs/model-routing.md) selects `openai/gpt-5.6-sol` for explicit
deep requests and a few complex workflows. Both use AI Gateway with OpenAI-only
provider routing.

The release is **implemented for a gated pilot**. It is not approved for broad
rollout. Follow [the operator checklist](docs/rollout.md) before deployment and
[the roadmap](ROADMAP.md) for subsequent increments.

The next [team-tool stack](docs/team-tools.md) adds conversation trace inspection,
requester-scoped connection checks, event/task reconciliation, and announcement
drafting. It extends the same pilot gate and action restrictions.

Prefix a request with `deep:` or `standard:` to select a profile for that turn.
Run `pnpm routing:check` to check the offline routing fixtures. The
[router pilot](docs/model-routing.md#operator-pilot) covers live model selection,
resume behavior, task quality, and cost.

## Access model

| Source | Credential | Permitted use |
| --- | --- | --- |
| Public Slack channels | Current requester's OAuth grant | Shared conversations and the requester's DM |
| Private Slack channels | Requester's explicit additional consent | Only that requester's DM session with Vee |
| Personal and group DM history | Not requested | No search or channel/thread retrieval |
| Notion, Granola, Calendar, AgentMail | Existing designated V1 accounts | Team data those accounts are permitted to share |
| GitHub | Existing V1 app installation | Only V1Michigan/vee and V1Michigan/website-v2 |

Slack messages and interactive continuations retain their verified user and
workspace identity. Each Slack retrieval checks the connected account against
that identity. Public conversations cannot use private search, even if their
requester has a private grant. Channel/thread reads check visibility before
retrieving messages. Slack MCP is used for retrieval. Ordinary replies use
Vee's existing bot identity.

Private results remain in the current DM session. Once private access is
requested, that session cannot query other providers, fetch public URLs, or
perform external actions. Start a separate conversation for those tasks.
There is no delegation or cross-session memory. Vee's current conversation
with the user is still conversation context, not a searchable personal inbox.

The old shared Slack grant is retained remotely for operator recovery.
Runtime code never requests it and never falls back to it after a user's
authorization fails. Shared credentials for the other services are unchanged.

## Retrieval

Vee selects sources based on the question. Slack owns discussions and integration
messages, Notion owns documentation, Granola owns meeting notes, Calendar owns
scheduling, and GitHub owns repository records. Notion is no longer mandatory
for every factual answer.

- `search_slack` uses focused keywords and filters, includes bots such as Tally,
  returns source permalinks, and exposes pagination.
- `read_slack` follows relevant channels or threads with access checks.
- `reconnect_slack` starts a fresh personal sign-in after an account mismatch or
  a request to reconnect. A resumed call verifies the account.
- `find_team_tools` discovers only locally allowed service tools and their
  current schemas. `read_team_data` executes their allowed read operations.
- `list_agentmail_inboxes` returns one page of up to 10 inboxes and reports a
  next-page token when present.

Results are bounded before entering durable history. Search output is labelled
as a retrieved subset. Vee must cite source links and explain pagination,
truncation, inaccessible records, and conflicting evidence. A search result is
not proof that it found every record.

Notion's shared connection must exclude `notion-ai-search` server-side. Its
ordinary search can otherwise include connected Slack sources. The guard
refuses that configuration before retrieval. Direct Notion page reads remain
available. See [Notion's search routing documentation](https://developers.notion.com/guides/mcp/mcp-supported-tools).

## Actions and reliability

All organizational mutations use `execute_team_action`. The original requester
reviews the complete tool arguments in Slack. Approval is bound to that person,
conversation, tool call, and argument digest. Another user's approval or changed
arguments cannot execute the call. Preparing AgentMail drafts is the only
approval exception. Sending drafts still requires approval.

GitHub restrictions are enforced in code: allowlisted repositories, `vee/*`
write branches created from `main`, issue creation, and draft pull requests
targeting `main`. No direct pushes to `main`, merges, repository administration,
secrets, workflow dispatch, or releases are exposed.

Eve can replay a tool step after a process crash. Before a write, Vee atomically
claims a durable attempt key in a Redis REST store. A replay cannot claim it
again. An unknown outcome requires checking the destination and a new approved
proposal. This prevents repeated dispatch of the same call; it does not promise
that every approved action succeeds.

Configure `VEE_ACTION_REDIS_REST_URL` and `VEE_ACTION_REDIS_REST_TOKEN` for a
durable store supporting atomic `SET ... NX`. Keep eviction disabled and do not
expire attempt keys while sessions can resume. Missing storage blocks writes,
including draft creation. Reads continue to work. The store contains only hashed
call identifiers and argument digests, never tokens or source content.

Transient reads retry at most three times, using bounded backoff and
`Retry-After`. Provider writes have no automatic retries. Authorization,
account mismatch, missing scopes, configuration errors, rate limits, outages,
and uncertain write outcomes use distinct safe failure codes.

Unrestricted shell execution, child agents, and public web tools are disabled
because they bypass the access and action guards. The framework's generic URL
fetcher also follows redirects from server-side requests. Repository work uses
guarded GitHub tools. A future web adapter must enforce permitted destinations
and private-session boundaries before these tools return.

## Diagnostics and setup

Use Node 24 or newer and the pinned pnpm version.

~~~bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm connections:check
pnpm connections:check slack-search --slack-user U0123456789
~~~

The diagnostic command distinguishes credential availability, identity checks,
MCP initialization, and successful retrieval. It prints safe status codes,
never tokens or retrieved records. A successful retrieval can have zero matches.
Checks make read-only provider calls and consume no model tokens.

Slack authorization happens interactively in Vee. The administrator command
`pnpm connections:authorize slack-search` is retired. Every participant consents
with their own V1 Slack account. Private-channel consent is requested only from
that person's DM.

Organizational credentials remain administrator-provisioned:

~~~bash
pnpm connections:authorize notion
pnpm connections:authorize granola
pnpm connections:authorize google-calendar
pnpm connections:authorize agentmail
~~~

Only use designated accounts whose accessible records can be shared with Vee's
users. GitHub uses its existing app installation. Calendar's connector and
Google APIs must be configured before authorization. Granola includes the
designated account's accessible notes, not every member's personal notes.
See [the setup and migration checklist](docs/rollout.md).

## Pilot gate

`VEE_SLACK_ROLLOUT` defaults to `pilot`. Set `VEE_SLACK_PILOT_USERS` to the two
verified Slack user IDs. An empty list admits nobody. The inbound channel and
tool execution both enforce the gate.

Set `VEE_SLACK_ROLLOUT=enabled` only after the complete validation checklist
passes. Set `disabled` to stop new inbound work and provider tool calls. Cancel
pending workflows before changing or rolling back a live deployment.

Live read-only checks from this checkout on September 29, 2026 found:

| Service | Result |
| --- | --- |
| GitHub | Credential, MCP initialization, and README retrieval succeeded |
| Notion, Granola, AgentMail | Connect required authorization for the existing shared subjects |
| Google Calendar | Connector not found |
| Slack for U092NE8JNHG | Per-user authorization required |
| Action journal | No local credentials configured |

These are environment-specific observations, not production verification.
No grants were changed or revoked by the checks.

## Cost and observability

No automatic pre-search, background summarization, indexing, scheduled model
calls, or classifier-model calls are introduced. OAuth and provider checks are
API calls. Deep requests use Sol at a higher token price, and switching models
can reduce cache reuse. Focused retrieval can reduce context. Discovery and
thread follow-ups can add model steps, so actual cost depends on the task.

Eve hooks emit one structured `vee.turn` record per terminal turn with token
usage, available cost, latency, tool failures/rejections, and completion status.
Schema version 2 includes the selected model and routing reason. This is Vee's
selection; the installed Eve hooks do not report the provider-served model ID.
Unknown usage is `null`, not zero. Latency includes approval and OAuth waiting.
A completed turn means Eve finished responding, not that a business workflow
succeeded. Logs use hashed turn identifiers and omit user IDs, queries, tool
arguments, source content, and credentials. Model input/output telemetry is
disabled. Authorized Eve session history still contains the conversation.

`check_ai_gateway_usage` remains an on-demand team-wide report for all time,
30 days, 7 days, and 24 hours. It includes system and BYOK requests.
`totalCostUsd` is Vercel-charged cost; `marketCostUsd` is provider list-price
usage. Neither is a remaining credit balance or a Vee-only bill. Reports cache
for five minutes and can lag. Local access can use `AI_GATEWAY_API_KEY`.
`AI_GATEWAY_USAGE_START_DATE` defaults to `2020-01-01`.

## Local development

~~~bash
pnpm dev
~~~

Link the intended Vercel project and obtain fresh local environment credentials
before provider checks. Deploy the complete PR stack only with pilot settings
and the operator prerequisites in place. Do not infer a successful deployment
or OAuth pilot from local test results.
