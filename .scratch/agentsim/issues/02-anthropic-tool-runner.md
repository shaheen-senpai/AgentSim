# 02 — Anthropic TypeScript SDK Tool Runner for the Reference Agent

Type: research
Status: resolved
Blocked by: —

## Question

What is the exact, current API for driving the **Reference Agent** with the Anthropic TypeScript SDK's **Tool Runner** (`client.beta.messages.toolRunner` + `betaZodTool`), such that the Runner can:

1. wrap each sim tool handler so every call is logged as an Event *before* the result returns to the model (per-turn hooks / interception points);
2. set `model: "claude-opus-5"`, `output_config: { effort: "low" }`, adaptive thinking, and **server-side fallbacks** (`betas` + `fallbacks: "default"`), and handle a `stop_reason: "refusal"`;
3. stream the loop (so the UI timeline can update live) and still obtain the final message / full transcript;
4. cap iterations (max turns) and set a sensible `max_tokens`;
5. swap the system prompt between the naïve and fixed agent versions with nothing else changing.

Needed: package name and current version; import paths for `betaZodTool` and the runner; the runner's options and event/hook surface; a minimal end-to-end example; the recommended way to also capture token usage per Run. **Primary sources**: the bundled `claude-api` skill docs at `/private/tmp/claude-502/bundled-skills/2.1.268/4eb12d85efa240a4083574a49906a4af/claude-api/typescript/claude-api/` (README.md, tool-use.md, streaming.md) and `shared/tool-use-concepts.md` there, then the `anthropic-sdk-typescript` repo for anything they don't cover. Do not guess signatures.

Write findings to `/docs/research/anthropic-tool-runner.md`.

## Answer

- `@anthropic-ai/sdk@0.125.0` (2026-09-10); `betaZodTool` from `@anthropic-ai/sdk/helpers/beta/zod`; loop via `client.beta.messages.toolRunner(params, { signal?, headers?, fallbackState? })`. Zod 4 optional peer dep.
- Runner = async iterable yielding one `BetaMessage` (or `BetaMessageStream` with `stream: true`) per API request, *before* tools run; also directly awaitable; `.done()` = final message; `runner.params.messages` = full transcript. No event emitter — hooks are: wrap each tool's `run` (logs before the `tool_result` is sent; `context.toolUse.id`), iterate the runner, `generateToolResponse()`, `pushMessages`/`setMessagesParams` (avoid inside the loop body — suppresses the runner's own append).
- Params for us: `model: "claude-opus-5"`, `thinking: { type: "adaptive" }`, `output_config: { effort: "low" }`, `fallbacks: "default"` + `betas: ["server-side-fallback-2026-07-01"]`, `max_iterations: N`, `stream: true`, `max_tokens: 16_000`, `system` = the only thing that differs between naïve and fixed.
- Runner stops on `stop_reason` `refusal`/`max_tokens`/`end_turn`/`stop_sequence`/`model_context_window_exceeded`; auto-resumes `pause_turn` (since 0.121.0 — bundled skill caveat is stale). Cap-out leaves final `stop_reason: "tool_use"` and the last turn's tools still executed.
- Usage: `message.usage.{input_tokens,output_tokens,cache_*,iterations}` per yielded message; sum yourself. Non-streaming `max_tokens` > 21,333 throws client-side; streaming has no such cap.
- Errors: `Anthropic.APIError` subclasses (`BadRequestError` 400, `RateLimitError` 429, …), `AnthropicError`, `APIUserAbortError`; throw `ToolError` from `@anthropic-ai/sdk/resources/beta/messages` inside tools.
- UNVERIFIED: the beta header for the *array* form of `fallbacks` (skill says `-2026-06-01`, SDK repo uses `-2026-07-01`) — use `"default"`.

Findings: docs/research/anthropic-tool-runner.md
