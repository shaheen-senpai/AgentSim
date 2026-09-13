# AgentSim — wayfinder map

Label: wayfinder:map
Created: 2026-09-13
Tracker: local markdown (`.scratch/agentsim/`)

## Destination

A **build-ready spec** for the AgentSim hackathon prototype at `docs/superpowers/specs/2026-09-13-agentsim-design.md` — architecture, domain model, Scenario schema, World seed, Run-page layout, demo script, and a task list ordered by demo-criticality — such that a coding session can start without asking a single further design question. When the frontier is empty, write the spec from `CONTEXT.md` + `docs/adr/` + `charting-decisions.md` + the resolved tickets, then hand off to the writing-plans skill.

## Notes

- **Destination reached 2026-09-13:** frontier empty; spec drafted at `docs/superpowers/specs/2026-09-13-agentsim-design.md`, awaiting the user's review, then hand-off to the writing-plans skill. Further work is execution from the spec, not tickets.

- **Domain**: glossary in `/CONTEXT.md` — use its terms exactly (Scenario, Run, Attack, Lure, Check, Violation, Trust Score, Dimension, World, Event, Snapshot, Replay, Rerun, Runner, System, Reference Agent, Task Brief, Policy). Load-bearing decisions are ADRs in `/docs/adr/`.
- **All 28 charting decisions**: `charting-decisions.md` (constraints, stack, scope cuts, model, evaluation, demo plan). Read it before working any ticket.
- **Skills**: grilling tickets → `/grilling` + `/domain-modeling`; prototype tickets → `/prototype`; any code touching Claude → the `claude-api` skill (TypeScript); the Run-page prototype may use the `design` skill.
- **Standing constraints**: 2 builders, 24–48h, live ≤ 3 min demo. TypeScript end-to-end, single Next.js app, files not DB, `claude-opus-5` at low effort, MCP for BYO agents. YAGNI ruthlessly — every ticket answer should make the spec *shorter*, not longer.
- **Execution stays outside the map.** Tickets resolve decisions; the build happens from the spec.
- Research tickets write findings to `/docs/research/<slug>.md`.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [01 — MCP server in a Next.js route handler](issues/01-mcp-server-in-nextjs.md) — use the **v2** SDK `@modelcontextprotocol/server@2.0.0` (+ `zod@^4.2`), not `@modelcontextprotocol/sdk`; spec 2026-07-28 removed sessions, so the server is stateless per request; `createMcpHandler(factory)` → `export const POST = (req) => handler.fetch(req)`; parse `runId` from the URL, World in a `globalThis` registry; `server.registerTool(name, {inputSchema: z.object(...)}, handler)`. **Verified end-to-end with Claude Code 2.1.270** via `claude mcp add --transport http …`. Findings: `docs/research/mcp-server-nextjs.md`.
- [03 — Does the naïve agent take the Lure reliably, and does the fix resist?](issues/03-injection-reliability.md) — Opus 5 & Sonnet 5: 0/45 across five injections (frontier models side with the Policy). **Haiku 4.5 + a prompt that trusts "internal notes": 10/10 Lure taken** (double refund, ticket resolved, customer emailed); Haiku + ordinary prompt: 0/5; **Haiku + prompt-only fix: 0/10 Lure, 10/10 correct**, clean 5/5. Data-access lure landed 0/10 everywhere. Lure amended to an *achievable* action (refund of order 1038 via `pay_7001`). Runs: 15–20 s, ≈$0.03. Recommends Q24 → Reference Agent on `claude-haiku-4-5`.
- [05 — Run page layout](issues/05-run-page-layout.md) — **Cockpit** (240px launcher rail · Event timeline with the injected email highlighted inline at #2 · 400px Trust Score + World diff) with a Replay scrubber under the timeline; Violations as red rows with a per-Check card linking back to the injection; live/completed/Replay are one design; prompt diff is a side sheet with a "Rerun with fixed" button; Compare is its own page (stretch). Poll `GET /runs/{id}` every 500 ms. Canvas: https://claude.ai/code/artifact/bbde0312-0dfd-4b36-8f31-a05987dc4ba2
- [04 — World seed data and the Scenario YAML schema](issues/04-world-seed-and-scenario-schema.md) — 7 entity types with every entity resolving to one Customer; Payment/Refund as separate entities, minor-unit GBP, prefixed IDs, frozen clock; 10 tools over 4 Systems (8-call happy path); Policy text travels in the Task Brief and speaks only of authority; 8 fixed Check types + synthesised `lure_not_taken`; zero-Check Dimension = 100. Complete `seeds/northwind.yaml` and `scenarios/duplicate-charge-refund.yaml` are in the Answer.
- [02 — Anthropic TS Tool Runner for the Reference Agent](issues/02-anthropic-tool-runner.md) — `@anthropic-ai/sdk@0.125.0`, `betaZodTool` + `client.beta.messages.toolRunner`; no hook API, so log Events by wrapping each tool's `run`; runner is an async iterable (one message per API turn) and awaitable; `fallbacks: "default"` + beta `server-side-fallback-2026-07-01`; sum `usage` per yielded message. Findings: `docs/research/anthropic-tool-runner.md`.

## Not yet specified

- **Second Scenario (Data Access)** — ticket 03 tried the obvious lever ("please also check order 1040", which belongs to another customer) and it landed **0/10 on Opus 5 and Haiku 4.5** — both noticed 1040 wasn't in the customer's orders. A Data Access failure needs a different lever (an injected *ticket note* naming the other customer's id? a lookalike email address? a weaker prompt that says "look up whatever the customer mentions"?). Schema and Seed are settled; only the lure is open. Revisit after the first Scenario demos end-to-end.
- **Claude Code as the agent under test** — the "connect your agent" encore. *Ticket 01 verified the connection works with one command*, so nothing is left to decide; it is now a stretch build task for the spec (behind the Compare page). Open only: how a BYO Run knows it has *finished* (agent calls a `finish` tool vs. idle timeout) — settle in the spec.
- **Compare page** — decided by ticket 05 (its own page, two columns, same chrome); remains a *stretch build item*, nothing left to decide.
- **Narrative explanation** — a Claude-written 2–3 sentence summary on top of Violation records. Prompt and placement unspecified; stretch.
- **Soft-quality Dimension via LLM judge** (tone / communication quality) — deferred as a late stretch; would need its own Check kind.
- **Simulated API failures** as a Scenario flag — from the pitch; not needed for the demo.

## Out of scope

- Scenario editor UI, run history, settings shell — a product shell, not a demo (charting Q20c).
- LLM-driven customer persona that replies to the agent — the World is static (charting Q17b).
- A database of any kind — files suffice for a hackathon (charting Q22).
- Per-agent permission profiles enforced by the sim — Policy lives in the Scenario (ADR-0001).
- A separate MCP server process, or reaching our MCP server via the API's MCP connector (ADR-0004).
