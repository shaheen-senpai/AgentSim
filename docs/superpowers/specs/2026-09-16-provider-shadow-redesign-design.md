# AgentSim Backend Redesign — Provider Shadows

## Context

The current engine's unit of authoring is a bespoke fictional World: a pack invents its own tool
names (`issue_refund`, `get_ticket`) for systems that stand in for real third-party services
(payments, support desk). A customer's own agent, which calls a real provider by that provider's
real tool names, can only be pointed at AgentSim through a hand-typed alias map on `/connect`.

The product's actual pitch is narrower and sharper than that: **a customer's agent keeps its
existing MCP config; only the URL for each third-party server changes, to one of ours.** For that
to be literally true, our MCP server for "Stripe" has to expose Stripe's real tool names and input
schemas, not our own invented ones. This spec redesigns the backend to make that true, and to make
the run's agent always be the customer's own — never an AgentSim-authored "Reference Agent."

Frontend reference: the design artifact at
`https://claude.ai/code/artifact/34c6783b-40f0-429d-ab1a-bff68c643bd2` (another session is
implementing it) is the source of truth for what a World's `sources` look like in the UI — a source
has a `kind` (`mcp`/`db`/`s3`/`tools`) and a `mode` (`shadowed`/`mocked`/`localstack`/`pasted`), and
every recorded Run is attributed to a named agent (`naïve · 0.1`, `Halvard Loop Agent`, `Anthropic
Connector · opus`) rather than to "the Reference Agent." This spec is the backend counterpart.

This is unrelated to `docs/superpowers/specs/2026-09-16-ui-redesign-design.md`, which is a
visual/typography-only pass over the *current* app with an explicit "no functional changes"
constraint — that spec's scope and this one's don't overlap.

## Decisions made during brainstorming

1. **Shadow fidelity: byte-compatible MCP tool shape.** A shadowed source's tools carry the real
   provider's real tool names and input schemas, hand-verified against that provider's own docs/MCP
   server — not full wire-protocol fidelity (no REST paths, auth headers, or error-code matching;
   that's explicitly out of scope, see below).
2. **Reference Agent: removed from the product.** No AgentSim-authored agent calls the Anthropic API
   as part of a product-facing Run. Every product Run is BYO. The mechanism that produces our own
   demo/golden-run data is relocated to dev tooling, not deleted outright (see §4).
3. **Provider scope: five catalog entries.** Stripe, Zendesk, Google Workspace, Okta, Slack — every
   provider the design artifact names across both of its Worlds (northwind: Stripe, Zendesk, Google
   Workspace; halvard: Okta, Slack).
4. **"Mocked" DB sources stay the existing in-memory entity engine.** No real SQL replica this pass;
   `mode: mocked` on a `kind: db` source is a UI/provenance label over the same World, not a new
   storage backend.

## Design

### 1. Worldpack format — `sources` replaces `systems`

`pack.yaml`'s `systems:` map (today: `{label}`, pure UI grouping/color) is extended in place, not
duplicated:

```yaml
sources:
  stripe:   { label: Stripe,   kind: mcp,  mode: shadowed, provider: stripe }
  support:  { label: Zendesk,  kind: mcp,  mode: shadowed, provider: zendesk }
  orders:   { label: "orders-svc · Postgres", kind: db, mode: mocked }
  own:      { label: "Northwind Support Bot's own tools", kind: tools, mode: pasted }
```

Every tool in `tools.yaml` still declares `system: <key>`, now resolving into `sources` instead of
`systems`. `kind` and `mode` are new, optional-with-default fields (`mode: pasted` when absent, for
backward compatibility with hand-authored packs); `provider` is required only when `mode: shadowed`.

### 2. Provider catalog — `src/providers/<id>/tools.yaml`

One file per provider (`src/providers/stripe/tools.yaml`, `zendesk/`, `google-workspace/`, `okta/`,
`slack/`), in the same entity-DSL shape as today's `tools.yaml` (`op`/`collection`/`guards`/
`subject`/`returns`), except tool names and input-schema field names are the provider's real MCP
tool names — hand-curated and checked against that provider's actual published tool list, not
generated. A World pack that shadows Stripe must declare matching collections (`payments`,
`refunds`, with the ownership chain the DSL already requires) in its own `entities:` — the same
requirement packs already meet today for their own invented tool names.

**Loader change** (`src/engine/pack.ts`): when building a pack's tool registry, a `mode: shadowed`
source resolves its provider id and merges that provider's tool defs in, tagged with the source. A
name collision between two shadowed sources in one pack (or between a shadowed source and a pack's
own tool) is a load-time validation error, not a silent overwrite. Adding a sixth provider later is
a new catalog file; no engine code changes.

### 3. MCP routing — one endpoint per source

`/mcp/runs/[runId]/[sourceId]/route.ts`, replacing the single `/mcp/runs/[runId]` endpoint. Each
endpoint publishes only that source's tools, under their real names, with the Task Brief still
carried as the `initialize` result's `instructions` on every one of a Run's endpoints (so whichever
one the agent's client reads first still gets it). This is required, not cosmetic: a real agent's
MCP config already has separate entries per provider (`stripe: <url>`, `zendesk: <url>`), so
intercepting both means owning both URLs.

The Shape B forwarder keeps one endpoint (`/api/runs/:id/call`) — a forwarder is a single call path
regardless of how many sources exist; `tool` in the request body disambiguates.

A `kind: db, mode: mocked` source is reached the same way as any other: an MCP endpoint publishing
the pack's own tools for it (`list_orders`, `get_order`, …), per decision 4 — not a connection
string or a SQL wire protocol. "Mocked DB" describes provenance in the UI, not a different access
path.

**The tool-name alias map becomes a fallback, not the primary mechanism.** It only ever existed to
bridge our invented names to an agent's real ones. Shadowed sources use the provider's real names
(no bridge needed) and pasted sources use the customer's own real names verbatim (imported from
their `tools/list`, no bridge needed). `toolAliases` on the Agent registry stays, for the rare case
where a customer's tool differs from ours in a name only, but stops being a required onboarding
step.

### 4. Reference Agent — removed from product code, relocated for demo data

Delete `src/runner/referenceAgent.ts` and `scripts/run-scenario.ts` from the product surface.
Golden-run generation moves to `scripts/demo-agent.ts` (dev tooling): a script that calls Anthropic
to play the role of an example customer agent, connected over the same MCP or forwarder shapes any
real BYO agent uses — it is a test fixture generator, not a runtime capability the product ships.
`worldpacks/*/agents/naive.md` / `fixed.md` are reframed as example customer prompt versions (same
files, same content, different meaning): what a "naive" vs "fixed" customer prompt looks like for a
demo, not "our" agent.

`POST /api/agents/[id]/prompt` is kept, generalized: any registered agent (BYO or demo-fixture) can
carry versioned prompt text, which is what the Compare page's prompt-diff already reads. This
doesn't depend on Reference Agent existing.

### 5. World authoring wizard

`/worlds/new` moves from "template or AI-draft from a description" to: pick vendors from a grid
(populated from the provider catalog) → optionally paste a DB schema dump → optionally paste the
customer's own `tools/list` for anything not covered by a known vendor. `src/generate/worldpack.ts`'s
prompt shrinks accordingly — Claude no longer invents tool schemas for a selected known vendor (those
come verbatim from the catalog); it designs the entity model and ownership map tying the selected
sources into one coherent World, synthesizes seed rows, and drafts Scenarios/Mandates/Checks/Attacks.
Less surface for the model to hallucinate on the part that most needs to be exactly right (a real
provider's tool shape).

### 6. End-to-end flow (unchanged below the Gateway)

Create Run → get back one MCP URL per shadowed/pasted source, plus the Task Brief → customer points
their existing per-provider MCP config entries at ours → agent runs unmodified → every call, from
whichever endpoint it arrived on, still funnels through the one `gateway.execute()` → World mutates,
Event appended → Evaluator scores exactly as today. The engine core (`gateway.ts`, `world.ts`,
`ownership.ts`, `checks.ts`, `evaluator.ts`, `attack.ts`, `lure.ts`) is untouched by this redesign;
everything above only changes how tools are declared and how many endpoints a Run exposes.

### 7. Mandate — a UI-only addition

The artifact's "Mandates" nav page reads each Scenario's existing `policy:` text plus the Checks
that trace back to it. Its own run-table data still keys the dimension `policy_compliance` and
labels the column "Policy" — so this redesign adds a standalone page and a small listing API over
the existing Scenario schema; it does not rename `policy:` or the `policy_compliance` dimension
internally. If a future pass wants "Mandate" to replace "Policy" everywhere (schema key, dimension
name, docs), that's a separate, larger rename this spec deliberately doesn't take on.

### 8. Migration of existing packs

`northwind`, `halvard-helpdesk`, `meridian-bank-support`: convert each `systems:` block to
`sources:`, extract the tool definitions that match a cataloged provider (payments→Stripe,
support→Zendesk, email→Google Workspace, directory→Okta, chat→Slack) into the new catalog files,
and leave genuinely pack-specific tools (orders, anything with no real-vendor equivalent) as
`pasted`/`mocked` in the pack's own `tools.yaml`. One migration per pack; mechanical once the
catalog exists.

### 9. Testing

- Provider-catalog parse/validation tests, extending the pattern in `tests/engine/pack.test.ts`.
- Per-source MCP routing tests, extending `tests/api/mcp.test.ts`: right tools on right endpoint,
  unknown `sourceId` 404s, Task Brief present on every source's `initialize`.
- A merge-collision test: two shadowed sources (or a shadowed source and a pack's own tool)
  declaring the same tool name on one pack is a load-time error.
- Golden-run replay tests must still pass unchanged — the Event/Gateway shape doesn't move, so
  `tests/engine/*` and the transcript-replay test are unaffected by this redesign.
- `tests/runner/referenceAgent.test.ts` is deleted or retargeted at the relocated demo script.

## Out of scope

- **Full wire-protocol/REST-level provider emulation** (the old spec's Shape C — real REST paths,
  auth headers, pagination, error-code matching). Every named provider is reachable over MCP, so
  MCP-level shadowing is sufficient; going further would duplicate the entity DSL's guard/ownership
  logic per provider for no product benefit right now.
- **A real SQLite/Postgres replica** (the old spec's Shape D). `mode: mocked` DB sources stay
  in-memory.
- **Renaming `policy_compliance`/"Policy" to "Mandate" throughout the engine and docs.** Scoped to
  the UI-only addition in §7.

## Risks / open items for review

- The provider catalog is hand-curated against each vendor's real tool docs; if a vendor changes
  its published MCP tool names or schemas, the catalog silently drifts out of sync. No automated
  check for this exists or is proposed here.
- Five providers is a real content-authoring cost (reading each vendor's actual MCP tool list
  carefully enough to reproduce it correctly) — likely the largest single line item in the
  implementation plan, not the routing or loader changes.
