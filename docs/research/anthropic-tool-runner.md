# Anthropic TypeScript SDK Tool Runner — research findings (ticket 02)

Researched 2026-09-13 against primary sources only: the bundled `claude-api` skill docs (paths abbreviated below as `SKILL/…` = `/private/tmp/claude-502/bundled-skills/2.1.268/4eb12d85efa240a4083574a49906a4af/claude-api/`), the published npm tarball `@anthropic-ai/sdk@0.125.0` (paths abbreviated as `SDK/…` = files inside the tarball; `SDK/src/...` is the shipped TypeScript source), and the `anthropics/anthropic-sdk-typescript` GitHub repo (`helpers.md`, `examples/`). Anything not confirmed by one of these is marked **UNVERIFIED**.

## TL;DR

1. Package `@anthropic-ai/sdk`, current version **0.125.0** (published 2026-09-10); tools via `betaZodTool` from `@anthropic-ai/sdk/helpers/beta/zod`, loop via `client.beta.messages.toolRunner(params, { headers?, signal?, fallbackState? })`. Zod is an optional peer dep (`^3.25.0 || ^4.0.0`).
2. The runner is an async iterable that yields one `BetaMessage` (or `BetaMessageStream` when `stream: true`) per API request *before* the tools run; it is also directly awaitable (`await runner` = `runUntilDone()`), and `.done()` returns the final message. `runner.params.messages` is the full transcript. Log tool calls by wrapping each tool's `run` (it runs before the `tool_result` is sent back); `context.toolUse.id` gives the `tool_use_id`.
3. Request shape for this project: `model: "claude-opus-5"`, `thinking: { type: "adaptive" }`, `output_config: { effort: "low" }`, `fallbacks: "default"` + `betas: ["server-side-fallback-2026-07-01"]`, `max_iterations: N`, `stream: true`, `max_tokens: 16_000`. The runner ends the loop on `stop_reason` `refusal`, `max_tokens`, `end_turn`, `stop_sequence`, `model_context_window_exceeded`; it auto-resumes `pause_turn`/`compaction` (since 0.121.0).
4. Usage is per yielded message (`message.usage.input_tokens` / `output_tokens` / cache fields / `iterations`); the runner does **not** aggregate — sum it yourself per turn.
5. Two stale claims in the bundled skill docs vs SDK 0.125.0: the runner *does* auto-resume `pause_turn` now, and the array-form `fallbacks` beta header is contested between sources (`-2026-06-01` in the skill vs `-2026-07-01` in the SDK repo) — use `fallbacks: "default"` with `-2026-07-01`, where all sources agree.

---

## 1. Package name and current version

- Package: `@anthropic-ai/sdk`. Install: `npm install @anthropic-ai/sdk zod`.
  Source: `SKILL/typescript/claude-api/README.md` → "Installation".
- Current version: **0.125.0**, `time.modified` 2026-09-10T17:55:20Z. Tarball `https://registry.npmjs.org/@anthropic-ai/sdk/-/sdk-0.125.0.tgz`.
  Source: `npm view @anthropic-ai/sdk version time.modified dist.tarball` (npm registry, 2026-09-13); `SDK/version.d.ts` (`VERSION = "0.125.0"`).
- Zod: optional peer dependency `"zod": "^3.25.0 || ^4.0.0"`. The Zod helper's types import `zod/v4`; the repo examples use `import { z } from 'zod/v4'`; the skill docs use `import { z } from "zod"` (both resolve on zod 4). Install zod 4.
  Source: `SDK/package.json` → `peerDependencies`; `SDK/helpers/beta/zod.d.ts` line 1; GitHub `examples/tools-helpers-advanced.ts`.
- Hard dependencies: only `json-schema-to-ts` and `standardwebhooks`. Source: `SDK/package.json` → `dependencies`.

## 2. Import paths

| Symbol | Import | Source |
|---|---|---|
| `Anthropic` (client) | `import Anthropic from "@anthropic-ai/sdk"` | `SKILL/typescript/claude-api/README.md` → "Client Initialization" |
| `betaZodTool` | `import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod"` | `SKILL/typescript/claude-api/tool-use.md` → "Tool Runner (Recommended)"; `SDK/helpers/beta/zod.d.ts` |
| `betaTool` (raw JSON Schema, no Zod) | `import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema"` | same; `SDK/helpers/beta/json-schema.d.ts` |
| `betaStandardSchemaTool` (Valibot/ArkType) | `@anthropic-ai/sdk/helpers/beta/standard-schema` | GitHub `helpers.md` → Tool Runner |
| Runner factory | `client.beta.messages.toolRunner(...)` (method, no import) | `SDK/resources/beta/messages/messages.d.ts` lines 78–84 |
| `BetaToolRunner`, `BetaToolRunnerParams`, `ToolError` | `import { ToolError, type BetaToolRunnerParams } from "@anthropic-ai/sdk/resources/beta/messages"` | `SDK/resources/beta/messages/index.d.ts` line 3 |
| `BetaRunnableTool`, `BetaToolRunContext` (types for a generic wrapper) | `import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool"` — resolvable because `package.json` exports `./lib/*`, but it is not re-exported from a documented barrel | `SDK/package.json` → `exports`; `SDK/lib/tools/BetaRunnableTool.d.ts` |
| Message types | `import type { BetaMessage, BetaMessageParam, BetaToolUseBlock } from "@anthropic-ai/sdk/resources/beta"` | GitHub `examples/tools-helpers-advanced.ts` |
| Error classes | `Anthropic.RateLimitError` etc. on the default export, or named: `import { APIError, RateLimitError, … } from "@anthropic-ai/sdk"` | `SKILL/typescript/claude-api/README.md` → "Error Handling"; `SDK/index.d.ts` line 8 |
| Client-side fallback middleware (not needed on the Claude API) | `import { betaRefusalFallbackMiddleware, BetaFallbackState } from "@anthropic-ai/sdk"` | `SDK/index.d.ts` line 5; GitHub `examples/fallbacks.ts` |

## 3. `betaZodTool` signature and what a runnable tool is

```ts
betaZodTool<InputSchema extends z.ZodType>(options: {
  name: string;
  inputSchema: InputSchema;
  description: string;
  run: (args: z.infer<InputSchema>, context?: BetaToolRunContext)
       => string | Array<BetaToolResultContentBlockParam> | Promise<...>;
  close?: () => void | Promise<void>;   // only called by the sessions runner, not by toolRunner
}): BetaRunnableTool<z.infer<InputSchema>>
```
Source: `SDK/helpers/beta/zod.d.ts` (verbatim types).

- `BetaRunnableTool<Input>` = a plain client tool definition (`BetaTool` etc.) `& { run, parse: (content: unknown) => Input, close? }` — a plain object, so `{ ...tool, run: wrapped }` is a valid way to wrap it.
  Source: `SDK/lib/tools/BetaRunnableTool.d.ts`.
- `BetaToolRunContext = { toolUse: BetaToolUse; toolUseBlock (deprecated); signal?: AbortSignal | null }` — `toolUse` carries `id`, `name`, `input`. `signal` aborts when the runner is aborted.
  Source: `SDK/lib/tools/BetaRunnableTool.d.ts`.
- `run` may return a string or content blocks (text/image…). Throwing produces a `tool_result` with `is_error: true` and content `Error: <message>`; throw `new ToolError(string | blocks)` to control the error content. **Note:** the runner calls `tool.parse(input)` (Zod validation) *inside* the same try, so a schema-invalid input from the model also becomes an `is_error` tool result rather than crashing the loop.
  Source: `SDK/src/lib/tools/BetaToolRunner.ts` → `generateToolResponse()`; `SDK/lib/tools/ToolError.d.ts`.
- Bundled `helpers.md` on GitHub shows `betaTool({ input_schema: … })`, but the shipped `SDK/helpers/beta/json-schema.d.ts` types the field as `inputSchema`. Trust the `.d.ts`.

## 4. The runner's options object (everything verified)

```ts
client.beta.messages.toolRunner(body, options?)
// overloads: body.stream?: false → BetaToolRunner<false> (yields BetaMessage)
//            body.stream: true   → BetaToolRunner<true>  (yields BetaMessageStream)
```
Source: `SDK/resources/beta/messages/messages.d.ts` lines 78–84; `SDK/src/resources/beta/messages/messages.ts` lines 224–231 (`return new BetaToolRunner(this._client, body, options)`).

`body: BetaToolRunnerParams = Omit<MessageCreateParams, 'tools'> & { tools; max_iterations?; compactionControl? }` — i.e. **every** `client.beta.messages.create` parameter plus:

| Option | Type | Notes / source |
|---|---|---|
| `tools` | `(BetaToolUnion \| BetaRunnableTool<any>)[]` | Runnable tools and raw server-tool objects can be mixed. `SDK/lib/tools/BetaToolRunner.d.ts` |
| `max_iterations` | `number?` | "Maximum number of iterations (API requests) to make in the tool execution loop … When exceeded, the loop will terminate even if tools are still being requested." Falsy (`0`/undefined) = unlimited. `SDK/lib/tools/BetaToolRunner.d.ts`; loop check in `SDK/src/lib/tools/BetaToolRunner.ts` |
| `stream` | `boolean?` | Selects yield type (see §7). Same file |
| `compactionControl` | deprecated | Use server-side compaction instead (`context_management: { edits: [{ type: "compact_20260112" }] }`, beta `compact-2026-01-12`). `SDK/lib/tools/CompactionControl.d.ts`; `SKILL/typescript/claude-api/README.md` → "Compaction" |
| `model` | `string` | `"claude-opus-5"` — `SKILL/shared/model-migration.md` → "Migrating to Claude Opus 5" ("Model ID `claude-opus-5` is authoritative as written here") |
| `max_tokens` | `number` (required) | See §8 |
| `system` | `string \| Array<BetaTextBlockParam>` | `SDK/resources/beta/messages/messages.d.ts` line 4991 |
| `messages` | `BetaMessageParam[]` (`role: 'user' \| 'assistant' \| 'system'`) | Cloned with `structuredClone` on construction, so you can reuse one seed array across runners. `SDK/src/lib/tools/BetaToolRunner.ts` constructor |
| `thinking` | `{ type: "adaptive", display?: "summarized" \| "omitted" \| "updates", block_binding? } \| { type: "disabled" } \| { type: "enabled", budget_tokens }` | `budget_tokens` 400s on Opus 5. `SDK/resources/beta/messages/messages.d.ts` → `BetaThinkingConfigAdaptive`; `SKILL/typescript/claude-api/README.md` → "Extended Thinking" |
| `output_config` | `{ effort?: 'low'\|'medium'\|'high'\|'xhigh'\|'max', format?, task_budget? }` | `SDK/resources/beta/messages/messages.d.ts` → `BetaOutputConfig` |
| `betas` | `Array<AnthropicBeta>` (header param, passed in the body object) | `SDK/resources/beta/messages/messages.d.ts` line 5109 |
| `fallbacks` | `Array<{ model, max_tokens?, output_config?, thinking?, speed? }> \| "default" \| null` | `SDK/resources/beta/messages/messages.d.ts` → `BetaFallbacksParam`, `BetaFallbackParam` |
| `tool_choice`, `stop_sequences`, `metadata`, `container`, `context_management`, `cache_control`, … | as on `messages.create` | Not needed here |

`options: BetaToolRunnerRequestOptions = Pick<RequestOptions, 'headers' | 'signal' | 'fallbackState'>` — note `timeout`/`maxRetries` are **not** per-runner; set them on the client (`new Anthropic({ timeout, maxRetries })`; defaults 10 min and 2 retries).
Source: `SDK/lib/tools/BetaToolRunner.d.ts`; `SDK/client.d.ts` lines 203–206.

## 5. Hook / interception surface (per turn)

The runner has **no event emitter and no callback options**. Its interception points are (all verified in `SDK/src/lib/tools/BetaToolRunner.ts` and `SDK/lib/tools/BetaToolRunner.d.ts`, method docs mirrored in GitHub `helpers.md` → "BetaToolRunner API"):

1. **Wrap `run` on each tool (the recommended logging point).** `run` executes between the model's `tool_use` and the `tool_result` being appended, so anything logged there is "before the result is returned to the model". Wrapping is a plain object spread (see §12 example). The runner runs multiple `tool_use` blocks from one turn **concurrently** (`Promise.all`), so log with `context.toolUse.id` and timestamps rather than assuming order.
2. **Iterate the runner**: `for await (const message of runner)` yields each assistant `BetaMessage` *before* its tools run (stream mode yields a `BetaMessageStream`; `await stream.finalMessage()` gives the `BetaMessage`). Inspect `message.content` for `tool_use` blocks, `message.stop_reason`, `message.usage`.
3. **`await runner.generateToolResponse(signal?)`** inside the loop body executes the pending tools *now* and returns the `{ role: "user", content: tool_result[] }` message that will be sent (or `null` if none). It is cached, so the runner will not re-execute the tools afterwards. The repo's `examples/tools-helpers-advanced*.ts` use exactly this to print tool results before they go back. (Mutating the returned object mutates what is sent — this follows from the source's shared cached promise but is **UNVERIFIED as a supported contract**.)
4. **`runner.pushMessages(...msgs)`** / **`runner.setMessagesParams(paramsOrMutator)`** — override the conversation or params before the next request (approval gates, retry with bigger `max_tokens`, etc.). **Footgun:** calling either inside the loop body sets an internal `mutated` flag, and the runner then *skips* appending the yielded assistant message itself and skips its stop-reason check for that turn (it assumes you took over). Do not call them from the logging path.
5. **`runner.setRequestOptions({ signal, headers })`** — swap the abort signal mid-run.
6. **`runner.params`** — read-only live view of current params; `runner.params.messages` is the transcript (snapshot it with `structuredClone` before storing; it is the runner's internal array).
7. **`runner.done()`** — resolves with the final `BetaMessage` after iteration completes; **`runner.runUntilDone()`** / `await runner` — consume everything and return the final message.

Loop mechanics that matter for a harness (from `SDK/src/lib/tools/BetaToolRunner.ts`):

- Per iteration: check `iterationCount >= max_iterations` → break; make the request; yield; append the assistant message to `params.messages`; classify `stop_reason`; if `tool_use` → run tools → append the tool-result user message → continue.
- `stop_reason` classification (`determineNextStepFromStopReason`): `tool_use` → run tools; `pause_turn` and `compaction` → re-send unchanged (auto-resume); `end_turn`, `stop_sequence`, `max_tokens`, `model_context_window_exceeded`, `refusal` → **stop**. A truncated turn (`max_tokens`) therefore ends the run silently — check the final `stop_reason`.
- When `max_iterations` is hit after a `tool_use` turn, the tools of that last turn **are still executed** and their results appended; the loop then stops before the next request. The final message from `.done()` then has `stop_reason: "tool_use"` and the transcript ends with a `user` tool-result message. Detect a cap-out by `final.stop_reason === "tool_use"`.
- Unknown tool name → `tool_result` `is_error: true` `Error: Tool 'x' not found`.
- API errors thrown during a request propagate out of the `for await` and reject `.done()`.
- The runner forwards a returned `container.id` into the next request automatically (server tools). Since 0.117.0 (`SDK/CHANGELOG.md`).

Corroboration for the "not a black box" framing: `SKILL/shared/tool-use-concepts.md` → "Tool Runner vs Manual Loop" (gating in `run`, `setMessagesParams()`/`pushMessages()`, `generateToolResponse()`, result modification, `max_iterations`, streaming supported).

## 6. Model, effort, adaptive thinking, fallbacks, refusal

**Model**: `model: "claude-opus-5"` — fixed ID, no date suffix; $5/$25 per MTok; 1M context; 128K max output; adaptive thinking; all five effort levels with no beta header; API default effort `high`.
Source: `SKILL/shared/model-migration.md` → "Migrating to Claude Opus 5" (intro and "Capability improvements → Effort").

**Effort**: `output_config: { effort: "low" }`. On Opus 5 "`low` and `medium` are unusually strong … the primary cost/latency lever"; `effort` does *not* reliably shorten visible output — add a conciseness instruction to the system prompt.
Source: `SKILL/shared/model-migration.md` → "Migrating to Claude Opus 5" → TL;DR and "Claude Opus 5 Migration Checklist" `[TUNE] Effort`.

**Adaptive thinking**: `thinking: { type: "adaptive" }` — on Opus 5 this equals omitting `thinking` (thinking is on by default). `max_tokens` caps thinking **plus** text. `thinking: { type: "disabled" }` is allowed only at effort ≤ `high` and is discouraged (tool calls can be emitted as plain text and never run). The skill says `display` defaults to `"omitted"` on Opus 5 while the SDK JSDoc says it "Defaults to `summarized`" — **conflict**; if the UI should show thinking summaries, set `display: "summarized"` explicitly.
Source: `SKILL/shared/model-migration.md` → "Breaking change 1/2" and "Two failure modes when thinking is disabled"; `SKILL/typescript/claude-api/README.md` → "Extended Thinking"; `SDK/resources/beta/messages/messages.d.ts` → `BetaThinkingConfigAdaptive.display`.

**Server-side fallbacks — exact current forms**:

- Recommended (all sources agree):
  ```ts
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  ```
  "`fallbacks: "default"` — recommended for every caller … picks Anthropic's recommended fallback automatically, routed by refusal category — cyber-category refusals go to Claude Opus 4.8 … the header is `server-side-fallback-2026-07-01`."
  Source: `SKILL/shared/model-migration.md` → "Migrating to Claude Opus 5" → "New API features → 1. `fallbacks: "default"`"; SDK type `BetaFallbacksParam = Array<BetaFallbackParam> | 'default'` and header literal in `AnthropicBeta` (`SDK/resources/beta/messages/messages.d.ts` line 2425; `SDK/resources/beta/beta.d.ts` line 52). `"default"` landed in SDK 0.115.0 (`SDK/CHANGELOG.md`).
- Array form `fallbacks: [{ model: "claude-opus-4-8" }]` (1–3 entries; supported targets `claude-opus-4-8`, `claude-opus-5`): the skill says the header must be exactly `server-side-fallback-2026-06-01` and that pairing either header with the other form returns a 400 (`SKILL/typescript/claude-api/README.md` → "Refusal Fallbacks"; `SKILL/shared/model-migration.md` → "`refusal` stop reason" → "Key semantics"). But the SDK repo's `examples/fallbacks.ts` (main) sends the array form with `betas: ['server-side-fallback-2026-07-01']`, and `SDK/src/lib/middleware.ts` line 214 tells users to "send `fallbacks:` with the `server-side-fallback-2026-07-01` beta header". **The correct header for the array form is therefore UNVERIFIED (sources conflict)** — avoid the array form for the hackathon, or smoke-test it once.
- Fallbacks trigger on policy declines only (not 429/529/5xx); rejected on Batches; unavailable on Bedrock/Vertex/Foundry (use `betaRefusalFallbackMiddleware` there). Sticky routing ~1 h after a fallback. Source: `SKILL/shared/model-migration.md` → "`refusal` stop reason" → "Key semantics".
- Reading the result: a `{ type: "fallback", from: { model }, to: { model } }` content block marks each switch; the served-by signal is a `type: "fallback_message"` entry in `usage.iterations`; `message.model` names the serving model. In streaming the fallback block arrives as an ordinary `content_block_start` and `message_start` already names the fallback model for pre-output declines.
  Source: same section; `SDK/resources/beta/messages/messages.d.ts` → `BetaFallbackBlock`, `BetaFallbackMessageIterationUsage`.

**Detecting / handling `stop_reason: "refusal"`**:

- A refusal is an HTTP 200 with `stop_reason: "refusal"`, `content` empty (pre-output) or partial (mid-stream; the partial is billed — discard it). `stop_details: BetaRefusalStopDetails | null` = `{ type: "refusal", category: 'cyber'|'bio'|'frontier_llm'|'reasoning_extraction'|'general_harms'|null, explanation: string|null, fallback_credit_token, fallback_has_prefill_claim, recommended_model }`. **Branch on `stop_reason`, never on `stop_details`** (can be `null` on a refusal). Never index `content[0]` unconditionally.
  Source: `SKILL/shared/model-migration.md` → "`refusal` stop reason - handle before reading content"; `SDK/resources/beta/messages/messages.d.ts` → `BetaRefusalStopDetails`, `BetaStopReason`.
- In the runner, `refusal` is classified as **stop**: the loop ends and `.done()` resolves with the refused message. With `fallbacks: "default"`, a final `stop_reason: "refusal"` means the whole chain refused.
  Source: `SDK/src/lib/tools/BetaToolRunner.ts` → `determineNextStepFromStopReason`; `SKILL/typescript/claude-api/README.md` → "Refusal Fallbacks".

## 7. Streaming the loop while keeping the final message and transcript

- Construct with `stream: true`. Each iteration yields a `BetaMessageStream`; consume it either as `for await (const event of stream)` (raw `BetaRawMessageStreamEvent`s: `message_start`, `content_block_start`, `content_block_delta` with `text_delta` / `input_json_delta` / `thinking_delta`, `content_block_stop`, `message_delta`, `message_stop`) or with listeners. Then `const message = await stream.finalMessage()`.
  Source: `SKILL/typescript/claude-api/streaming.md` → "Streaming with Tool Use (Tool Runner)" and "Stream Event Types"; GitHub `examples/tools-helpers-advanced-streaming.ts`.
- `BetaMessageStream.on()` events (exact, 0.125.0): `connect`, `streamEvent(event, snapshot)`, `text(delta, snapshot)`, `citation`, `inputJson(partialJson, jsonSnapshot)`, `thinking(delta, snapshot)`, `signature`, `compaction`, `message(message)`, `contentBlock(block)`, `finalMessage(message)`, `error(AnthropicError)`, `abort(APIUserAbortError)`, `end`. Also `.off/.once/.emitted`, `finalMessage()`, `finalText()`, `currentMessage`, `abort()`, `toReadableStream()`.
  Source: `SDK/lib/BetaMessageStream.d.ts` → `MessageStreamEvents`.
- Use `finalMessage()`; do not wrap `.on()` in `new Promise` (`SKILL/typescript/claude-api/streaming.md` → "Best Practices").
- After the loop: `const final = await runner.done()` (final assistant `BetaMessage`); `const transcript = structuredClone(runner.params.messages)` — includes the seed user message, every assistant turn (with `tool_use` blocks) and every tool-result user message. Source: `SDK/src/lib/tools/BetaToolRunner.ts` (messages are pushed into `#state.params.messages`; `params` getter).
- The bundled skill's caveat that the runner "does not auto-resume `pause_turn` (as of 0.110.0)" is **stale**: fixed in 0.121.0 ("tools: keep the tool runner going on pause_turn (#288)", `SDK/CHANGELOG.md`), and the 0.125.0 source resumes `pause_turn`/`compaction`. The skill's `pushMessages` workaround is harmless but unnecessary.

## 8. Capping iterations and choosing `max_tokens`

- `max_iterations: N` = max API requests per run (each request = one assistant turn). Repo example uses `max_iterations: 10` ("limits the conversation to at most 10 back and forth"). Cap-out detection: final `stop_reason === "tool_use"` (see §5). Source: GitHub `examples/tools-helpers-advanced.ts`; `SDK/lib/tools/BetaToolRunner.d.ts`.
- `max_tokens` is required and is a hard cap on thinking + text per turn on Opus 5 (`SKILL/shared/model-migration.md` → "Breaking change 1"). At effort `low` the thinking share is small.
- **Non-streaming guard (SDK-enforced)**: when `stream` is false and no explicit `timeout` is configured, the SDK computes `expected = 60 min × max_tokens / 128 000`; if that exceeds 10 min it throws `AnthropicError("Streaming is required for operations that may take longer than 10 minutes…")` *before* sending. That is a ceiling of **21,333 `max_tokens` for non-streaming** requests (older models have lower fixed caps in `MODEL_NONSTREAMING_TOKENS`; `claude-opus-5` has none). Streaming has no such client-side ceiling (model max 128K).
  Source: `SDK/src/client.ts` → `calculateNonstreamingTimeout`; `SDK/src/resources/beta/messages/messages.ts` lines 111–115; `SDK/src/internal/constants.ts`.
- Guidance from the skill docs: non-streaming examples use `max_tokens: 16000`; streaming examples use `64000`; "At `xhigh` or `max`, set a large `max_tokens` … Start at 64K". For this project (effort `low`, streaming on): **`max_tokens: 16_000`** per turn is comfortable; go to 32K–64K only if turns truncate (`stop_reason: "max_tokens"`, which ends the run).
  Source: `SKILL/typescript/claude-api/tool-use.md`, `streaming.md` (examples); `SKILL/shared/model-migration.md` → "Migrating to Claude Opus 5" → "Capability improvements → Effort".

## 9. Same tools, two system prompts (naïve vs fixed)

- `system` is an ordinary param (`string | Array<BetaTextBlockParam>`); build one `toolRunner()` per variant with identical `tools`, `messages`, `model`, `max_tokens`, `thinking`, `output_config`, `betas`, `fallbacks`, `max_iterations`, `stream`, and only `system` differing. The runner `structuredClone`s `messages`, so one seed array can be shared; `tools` are **not** cloned (they hold functions), so if the logging wrapper closes over a per-run event log, build the wrapped tools per run (as in §12).
  Source: `SDK/src/lib/tools/BetaToolRunner.ts` constructor; `SDK/resources/beta/messages/messages.d.ts` line 4991.
- Prompt caching: the two variants have different prefixes and therefore separate caches; keep each system prompt byte-stable across turns and runs (Opus 5 minimum cacheable prompt is 512 tokens). Optional for a hackathon.
  Source: `SKILL/typescript/claude-api/README.md` → "Prompt Caching"; `SKILL/shared/model-migration.md` → "Lower prompt-cache minimum".

## 10. Reading `usage` per turn and in total

- Every `BetaMessage` (each non-stream yield, or `await stream.finalMessage()`) has `usage: BetaUsage` with `input_tokens`, `output_tokens`, `cache_creation_input_tokens | null`, `cache_read_input_tokens | null`, `cache_creation`, `output_tokens_details: { thinking_tokens } | null`, `iterations: BetaIterationsUsage | null`, `server_tool_use`, `service_tier`, `speed`, `inference_geo`, `fallback_credit`.
  Source: `SDK/resources/beta/messages/messages.d.ts` → `BetaUsage`, `BetaOutputTokensDetails`.
- The runner keeps **no** running total — sum per iteration in the loop (the SDK's own deprecated compaction code computed context size as `input + cache_creation + cache_read + output`; `SDK/src/lib/tools/BetaToolRunner.ts` → `#checkAndCompact`).
- In streaming, `message_delta` carries usage (`SKILL/typescript/claude-api/streaming.md` → "Stream Event Types"), but `finalMessage().usage` is the simplest source.
- On fallback turns, top-level `usage` covers only the attempt that produced the message; `usage.iterations` is the per-attempt source of truth (`type: "message" | "fallback_message" | "compaction" | …`, each with `model`, `input_tokens`, `output_tokens`, cache counts). Declined-before-output attempts are reported but not billed.
  Source: `SKILL/shared/model-migration.md` → "`refusal` stop reason" → "Billing"; `SDK/resources/beta/messages/messages.d.ts` → `BetaIterationsUsage`, `BetaMessageIterationUsage`, `BetaFallbackMessageIterationUsage`.

## 11. Typed error classes to catch

All extend `AnthropicError`; API errors extend `APIError` with `.status`, `.headers`, `.error`, `.requestID`. Check most-specific first; never string-match messages.

| Class | Status | Notes |
|---|---|---|
| `BadRequestError` | 400 | includes bad/unknown `anthropic-beta` values and wrong header/form pairing for `fallbacks` |
| `AuthenticationError` | 401 | |
| `PermissionDeniedError` | 403 | |
| `NotFoundError` | 404 | model typo / model not enabled for org |
| `ConflictError` | 409 | |
| `UnprocessableEntityError` | 422 | |
| `RateLimitError` | 429 | Opus 5 has its own rate-limit bucket; SDK retries 2× by default |
| `InternalServerError` | ≥500 (incl. 529 overloaded) | retryable |
| `APIConnectionError` / `APIConnectionTimeoutError` | – | network / client timeout |
| `APIUserAbortError` | – | your `AbortSignal` fired |
| `AnthropicError` | – | base; also thrown for "Streaming is required…" and "ToolRunner concluded without a message from the server" |
| `ToolError` | – | *thrown by you inside `run`* to return structured `is_error` content; not something to catch |

Source: `SDK/core/error.d.ts`; `SDK/index.d.ts` line 8; `SKILL/typescript/claude-api/README.md` → "Error Handling"; `SKILL/shared/error-codes.md` → "Error Code Summary"; `SDK/lib/tools/ToolError.d.ts`.

## 12. Minimal end-to-end example (two tools, logging wrapper, streaming, two prompts)

Every API used below is verified in the sources cited above. Type-checking against 0.125.0 was **not** run in this research pass (no code was added to the project) — treat exact type annotations on the wrapper as the one spot to compile-check first.

```ts
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import type { BetaMessage, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta";
import { z } from "zod";

const client = new Anthropic(); // ANTHROPIC_API_KEY from env

// ---- 1. Event log + wrapper: logs every call BEFORE its result goes back to the model
type Event =
  | { type: "tool_call"; runId: string; toolUseId: string; name: string; input: unknown; at: number }
  | { type: "tool_result"; runId: string; toolUseId: string; name: string; result?: unknown; error?: string; isError: boolean; ms: number }
  | { type: "turn"; runId: string; turn: number; stopReason: string | null; model: string; usage: BetaMessage["usage"] }
  | { type: "refusal"; runId: string; category: string | null };

function withEventLog<T>(tool: BetaRunnableTool<T>, log: Event[], runId: string): BetaRunnableTool<T> {
  return {
    ...tool,
    run: async (input, context) => {
      const toolUseId = context?.toolUse.id ?? "unknown";
      const at = Date.now();
      log.push({ type: "tool_call", runId, toolUseId, name: tool.name, input, at });
      try {
        const result = await tool.run(input, context);        // input is already Zod-parsed
        log.push({ type: "tool_result", runId, toolUseId, name: tool.name, result, isError: false, ms: Date.now() - at });
        return result;
      } catch (err) {
        log.push({ type: "tool_result", runId, toolUseId, name: tool.name, error: String(err), isError: true, ms: Date.now() - at });
        throw err; // runner turns this into a tool_result with is_error: true
      }
    },
  };
}

// ---- 2. Two sim tools
const lookupOrder = betaZodTool({
  name: "lookup_order",
  description: "Look up an order by id. Call this before taking any action on an order.",
  inputSchema: z.object({ orderId: z.string().describe("Order id, e.g. ORD-123") }),
  run: async ({ orderId }) => JSON.stringify({ orderId, status: "shipped", total: 42.5 }),
});

const refundOrder = betaZodTool({
  name: "refund_order",
  description: "Issue a refund for an order. Only call after lookup_order confirms the order exists.",
  inputSchema: z.object({ orderId: z.string(), amount: z.number().positive() }),
  run: async ({ orderId, amount }) => `Refunded ${amount} on ${orderId}`,
});

// ---- 3. One run = one runner; only `system` differs between the naive and fixed agents
export async function runAgent(label: "naive" | "fixed", system: string, task: string) {
  const runId = `${label}-${Date.now()}`;
  const log: Event[] = [];
  const tools = [lookupOrder, refundOrder].map((t) => withEventLog(t, log, runId));

  const runner = client.beta.messages.toolRunner({
    model: "claude-opus-5",
    max_tokens: 16_000,
    system,
    thinking: { type: "adaptive" },            // Opus 5 default; add display: "summarized" to show summaries
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",                      // server-side refusal fallback, routed by category
    tools,
    messages: [{ role: "user", content: task }],
    max_iterations: 12,
    stream: true,
  });

  const totals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let turn = 0;

  for await (const stream of runner) {           // one BetaMessageStream per assistant turn
    turn++;
    stream.on("text", (delta) => process.stdout.write(delta));                 // live UI
    stream.on("contentBlock", (block) => {
      if (block.type === "tool_use") console.log(`\n[turn ${turn}] wants ${block.name}(${JSON.stringify(block.input)})`);
    });

    const message = await stream.finalMessage(); // complete BetaMessage for this turn
    totals.input_tokens += message.usage.input_tokens;
    totals.output_tokens += message.usage.output_tokens;
    totals.cache_read_input_tokens += message.usage.cache_read_input_tokens ?? 0;
    totals.cache_creation_input_tokens += message.usage.cache_creation_input_tokens ?? 0;
    log.push({ type: "turn", runId, turn, stopReason: message.stop_reason, model: message.model, usage: message.usage });

    const fellBack = (message.usage.iterations ?? []).some((it) => it.type === "fallback_message");
    if (fellBack) console.log(`[turn ${turn}] served by fallback model ${message.model}`);

    if (message.stop_reason === "refusal") {     // whole fallback chain refused; runner will stop
      log.push({ type: "refusal", runId, category: message.stop_details?.category ?? null });
    }
    // Do NOT call runner.pushMessages / setMessagesParams here unless you intend to take over the turn.
  }

  const final: BetaMessage = await runner.done();
  const transcript: BetaMessageParam[] = structuredClone(runner.params.messages);
  const cappedOut = final.stop_reason === "tool_use";   // hit max_iterations mid-loop
  const truncated = final.stop_reason === "max_tokens"; // raise max_tokens if this happens

  return { runId, final, transcript, totals, log, turns: turn, cappedOut, truncated };
}

// ---- 4. Naive vs fixed
const TASK = "Customer says order ORD-123 arrived damaged; make it right.";
const naive = await runAgent("naive", "You are a support agent. Resolve the customer's issue.", TASK);
const fixed = await runAgent("fixed", "You are a support agent. Always call lookup_order before refund_order. Be concise.", TASK);
```

Error handling around `runAgent`:

```ts
try { await runAgent(...); }
catch (e) {
  if (e instanceof Anthropic.RateLimitError) { /* back off */ }
  else if (e instanceof Anthropic.BadRequestError) { /* e.g. wrong beta header/form */ }
  else if (e instanceof Anthropic.APIError) { console.error(e.status, e.message); }
  else throw e;
}
```

Non-streaming variant: drop `stream: true`; the loop becomes `for await (const message of runner) { … }` and `await runner.generateToolResponse()` inside the body returns the tool-result message that will be sent (tools execute at that point, once).
Source: GitHub `examples/tools-helpers-advanced.ts`; `SDK/src/lib/tools/BetaToolRunner.ts`.

## 13. Discrepancies found between sources (read before trusting any single doc)

| Topic | Bundled skill says | SDK 0.125.0 / repo says | Use |
|---|---|---|---|
| `pause_turn` in runner | not auto-resumed (as of 0.110.0) | auto-resumed since 0.121.0 | no workaround needed |
| Array-form `fallbacks` header | exactly `server-side-fallback-2026-06-01`; cross-pairing 400s | `examples/fallbacks.ts` and `src/lib/middleware.ts` pair the array with `-2026-07-01` | **UNVERIFIED**; prefer `fallbacks: "default"` + `-2026-07-01` |
| `thinking.display` default on Opus 5 | `"omitted"` | JSDoc: "Defaults to `summarized`" | set explicitly if you need it |
| `betaTool` schema field | – | `helpers.md`: `input_schema`; `.d.ts`: `inputSchema` | `inputSchema` |
| `helpers.md` model ids | `claude-opus-5` throughout | examples use `claude-sonnet-5` | irrelevant; use `claude-opus-5` |

## Risks for a 48h hackathon

1. **Beta surface, moving fast.** `toolRunner` is beta; behaviour changed as recently as 0.121.0 (pause_turn) and 0.117.0 (container forwarding). Pin `"@anthropic-ai/sdk": "0.125.0"` exactly and do not upgrade mid-event.
2. **Fallback header ambiguity → 400 at first call.** A wrong `anthropic-beta` value is a `BadRequestError` ("Unexpected value(s) … for the `anthropic-beta` header"). Smoke-test one request with `fallbacks: "default"` + `server-side-fallback-2026-07-01` in the first hour; if it 400s, drop `fallbacks` and handle `stop_reason: "refusal"` manually rather than debugging headers.
3. **`max_iterations` still runs the last turn's tools.** Side-effecting sim tools will execute on the capped turn even though the model never sees the results; the final message has `stop_reason: "tool_use"`. Make the sim tools idempotent or treat cap-outs as a distinct outcome.
4. **Silent stop on `max_tokens`.** A truncated turn ends the run with no error. Log `final.stop_reason` on every run; with effort `low` and `max_tokens: 16_000` this should be rare.
5. **Parallel tool execution.** Multiple `tool_use` blocks in one turn run concurrently (`Promise.all`); the event log must key on `tool_use_id`, not arrival order. If the sim needs sequential calls, pass `tool_choice: { type: "auto", disable_parallel_tool_use: true }` (`SKILL/shared/tool-use-concepts.md` → tool choice).
6. **Mutating the runner from the loop body.** `pushMessages`/`setMessagesParams` inside `for await` suppresses the runner's own append/stop-reason logic for that turn. Keep the logging path read-only; `runner.params.messages` is the live internal array — `structuredClone` it.
7. **Usage must be summed by hand**, and on fallback turns top-level `usage` covers only the serving attempt; read `usage.iterations` if cost accounting matters.
8. **Refusal false positives.** Opus 5's classifiers can trip on benign "security"/"bio"-flavoured scenarios; keep sim scenarios mundane (orders, calendars) or accept occasional fallbacks. Never read `content[0]` before checking `stop_reason`.
9. **Rate limits.** Opus 5 has its own bucket; two agents × many runs concurrently will hit `RateLimitError` (SDK retries 2× with backoff by default). Add a small concurrency limiter.
10. **Opus 5 always thinks** — cost/latency is dominated by thinking + tool loops; `effort: "low"` is the lever, `max_tokens` is not. Add "be concise" and scope-discipline lines to the system prompts (`SKILL/shared/model-migration.md` → Opus 5 checklist).
11. **Streaming is mandatory above 21,333 `max_tokens`** on the default client timeout; you are streaming anyway, but a non-streaming debug script with `max_tokens: 64000` will throw immediately.
12. **Zod versions.** Use zod 4 (`import { z } from "zod"`); mixing zod 3 without `zod/v4` will fail type inference in `betaZodTool`.
