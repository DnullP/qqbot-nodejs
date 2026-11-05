# Maintained protocol fork

Origin: https://github.com/DnullP/qqbot-nodejs
Upstream: https://github.com/tencent-connect/qqbot-nodejs
Baseline: official 1.0.5, `429a0f1b798f3b0fcef3679e207dbc0469a1df2d` (see `upstream.lock`).
The MIT license, Tencent attribution, upstream history and existing send APIs are preserved.
This fork is private-to-npm (`private: true`), with semantic-release npm publishing disabled.
The inherited CI contains verification only, and no package-publication workflow is added.

## Added APIs

- `bot.on("rawEvent", ...)` now receives unknown signed Webhook dispatches, like WebSocket.
  Low-level `EventTransportCallbacks.onRawEvent` is also available; an interaction without
  an interaction callback falls back to raw. HTTP ACK is returned without waiting for handlers.
- `InteractionEventType` names current **outer** types 11/12/13/14/15/16/18/19/20.
  `requiresInteractionAck(type)` returns true only for 11/12. Legacy `InteractionType`
  CONFIG_QUERY/CONFIG_UPDATE values and arbitrary unknown outer types are retained.
  `resolved` retains mixed/nested JSON rather than coercing numbers or dropping unknown keys.
  This classifies transport ACK only; it does not execute model, permission or session actions.
- `bot.sendProactiveText(target,text)`, `sendProactiveRaw(target,body)`,
  `sendProactiveRich(target,body)` and `sendProactiveTextChain(target,text,options)`
  (also on `MessageApi`, using scope/targetId/credentials) explicitly omit top-level
  `msg_id`, `event_id` and `msg_seq`, including stale anchors on a reused target/body.
  Raw construction copies the input. These methods issue one POST with no uncertain-delivery
  retry and no fallback to passive mode. Proactive requests set `redirect: "manual"`, so
  307/308 cannot implicitly replay the POST. Redirects, network failures and unreadable or
  malformed success responses expose `ApiError.deliveryStatus: "unknown"`; callers must
  reconcile delivery rather than retry or fall back. Ordinary API GET redirects remain
  compatible. Account quotas and platform permissions still apply.
  Existing `send`, `sendRaw`, media, typing and stream helpers keep their original behavior.
- `OfficialMessageFields` adds `prompt_keyboard`, `action_button`, `subscribe_id`,
  `feature_id` and legacy `stream {state,id,index,reset}`. The latter is **not** the separate
  `/stream_messages` protocol. These types express official DTOs, not account entitlement.
- `commandInput(text,{show,reference})` and `commandEnter(text,scope)` construct Markdown
  text-chain tags with encoded attributes and 1–100-character validation. `commandEnter`
  rejects scopes other than C2C. `sendProactiveTextChain` sends this as Markdown explicitly.

```ts
import {QQBot, requiresInteractionAck} from '@tencent-connect/qqbot-nodejs';
const bot = new QQBot({appId: process.env.QQBOT_APP_ID!, appSecret: process.env.QQBOT_APP_SECRET!});
// Authorization of this target remains the caller's responsibility.
await bot.sendProactiveTextChain({scope:'c2c',targetId:'AUTHORIZED_TARGET'}, '/status', {mode:'input',show:'状态'});
bot.on('interaction', async (ctx, event) => {
  if (requiresInteractionAck(event.type)) await ctx.bot.acknowledgeInteraction(event.id);
  // Independently validate actor, deduplication and host action before executing anything.
});
```

## Opt-in wire observations

`wireObserver(event)` is accepted by `QQBotOptions`, `ApiClientConfig`, `TokenManager`,
`GatewayConnectionOptions` and `WebhookTransportOptions`. It receives detached sanitized
JSON values; changing one cannot change the request or the dispatcher input. Throws/rejected
promises are isolated. Observers must enqueue quickly; this SDK does not provide disk storage,
queue bounds, retention, correlation across attempts, backpressure or durable delivery.

Coverage: complete parsed JSON HTTP request/response envelopes for `ApiClient` (including
media JSON calls), token requests/responses, inbound WS JSON frames before dispatch including
control/unknown frames, outbound IDENTIFY/RESUME/heartbeat attempts, WS open/close/error,
Webhook input (including invalid signatures) and HTTP responses. Known credential keys are
recursively redacted, URL signature parameters and bearer/QQBot values are removed, current
credentials are substituted in text. Session/upload capability handles, signature headers,
`message_scene` and inline `file_data` are intentionally redacted. Hosts handling additional
secret fields must add their own policy before persisting observations.

Malformed/non-JSON bodies expose only byte length and `capture: incomplete`, never raw text.
`capture: complete` means the full parsed envelope **after intentional redaction**, not binary
capture or a claim that all transport operations are covered. Third-party COS/multipart/chunk
binary IO, media downloads, failed response-body reads and some early token/connect failures
remain outside this hook. Outbound WS entries describe attempts, not proof of server receipt.
Normal inherited debug logger output is a separate channel; use the safe observer for audit
storage and avoid enabling inherited verbose logs with credentials/private payloads.

## Evidence and account verification

- Current interactions and 11/12 ACK rule:
  https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/interaction_create.html
- ACK endpoint and type14 gray-bar ambiguity (no blanket type14 ACK):
  https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/interactions_interaction_id.put.html
- Text-chain syntax, scope and 100-character limit (live read 2026-11-05):
  https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/trans/text-chain.html
- Extra message fields and stream/reset wire shape:
  https://github.com/tencent-connect/botgo/blob/fe31c0dfe469001e0f783d2f07e7de7bd08b403f/dto/message_create.go

All added native action-button, subscription, text-chain and stream/reset capabilities remain
**account_support_unverified / client_effect_unverified**. No real QQ message, secret, private
identifier or media fixture was used. No poke/nudge protocol is invented. No model-facing REST
escape hatch is added; the inherited low-level API remains a developer interface.

## Tracking and updating

Run `node scripts/check-upstream.mjs --output /tmp/qqbot-upstream-report` (no dependencies).
The script reads the pinned lock, fetches official objects into a disposable bare repository,
compares official HEAD, prints the status/diffstat and writes `summary.md` plus `upstream.diff`.
It never modifies this checkout/lock, installs upstream code, merges or pushes. Network/git
errors fail visibly. The scheduled Monday UTC and manual `Official upstream check` workflow
has `contents: read`, no secrets and uploads the report/diff as an artifact. Schedules run on
the fork's default branch; configuration is distinct from evidence of a completed scheduled run.

To update: fetch upstream, review its public diff and this fork's changes, merge explicitly on
a review branch, run typecheck/lint/full tests/coverage/build, review behavior and only then
update the pinned lock. Never automatically overwrite fork changes or replace unknown events
with speculative enums. Preserve baseline commits so future checks can compare history.

## Regression evidence

`test/fork-protocol.test.ts` adds synthetic regression coverage. The initial five cases failed
against upstream (unknown Webhook discarded; missing current ACK/text-chain/proactive APIs;
wire observer absent), then passed. Additional red-green cases cover stale facade targets,
session/signature/signed-URL redaction, and Webhook error responses. Integration checks use a
localhost WS server and synthetic token fetches. Run `pnpm typecheck`, `pnpm lint`,
`pnpm test`, `pnpm test:coverage`, and `pnpm build` for fresh results.

### Known inherited coverage debt

Fresh validation on 2026-11-05: all 209 tests across 11 files pass; typecheck, lint and build
pass. `pnpm test:coverage` runs the same passing tests but exits 1 because inherited global
thresholds are unmet: fork lines 43.32%, branches 37.77%, functions 42.85%, statements 43.47%.
A separate pristine 1.0.5 worktree confirms pre-existing debt: lines 39.33%, branches 34.08%,
functions 39.43%, statements 39.27%. No threshold was lowered. CI gates the full test suite
and runs coverage as a clearly named nonblocking report until the repository-wide coverage
debt is addressed. This is not described as a passing coverage check.

### Independent review corrections

Localhost 307/308 fixtures first reproduced implicit POST replay, then passed after explicit
proactive-only manual redirect handling. Four proactive helper families each issue one POST
and expose the redirect's original status plus unknown-delivery classification. Another
fixture reproduced COS `q-signature`/`q-ak` and percent-encoded query-key leakage in both media
request payloads and responses. Query keys are now decoded/normalized before redaction,
including multiple signed URLs embedded in a text field; unrelated values remain visible.

Windows CI exposed two inherited concurrency tests that assumed 10+5+5ms sleeps complete
inside a 30ms busy interval. Both failed twice while the protocol regressions passed. Those
two tests now explicitly hold/release the owner with a promise, retaining all queue/flush
assertions without depending on OS timer granularity. No concurrency production code changed.
