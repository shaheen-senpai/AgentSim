# Plugin re-wire — the plugin builds the World, the platform writes the tests

**Date** 2026-09-17 · **Status** Spec under review · **Branch** `sn/build/plugin-rewire`
· **Design source** `design/agentsim-console.html`

## 1. Context

The worldbuilder plugin currently does everything in one Opus call: `register_agent` sends the
agent's tools, schema and OpenAPI to `generateWorldPack`, which returns a complete pack —
`pack.yaml`, `tools.yaml`, `seed.yaml`, `scenarios/*.yaml` (task brief, policy, checks, attacks)
and `agents/*.md` — and `create_world` persists it as a live, immediately runnable World.

Two things are wrong with that. The plugin invents the *test* (scenarios, seed rows, attacks) from
inside the customer's repo, where it has no reason to be authoritative; and it can publish a World
nobody on the platform ever looked at.

This spec splits the two jobs. The plugin **captures** what is true about the agent — its tools, its
database schema, the third-party MCP servers it integrates, and its mandates — and that becomes the
simulated World. The platform **generates** everything the World is tested with — seed data,
Scenarios, Attacks — with its own LLM calls, under human review. A plugin-built World lands as a
draft and cannot be run until a human on the platform reviews it and publishes it.

## 2. Confirmed facts (verified against the code, not assumed)

- `src/app/mcp/worlds/route.ts` exposes `register_agent`, `refine_world`, `get_world_draft`,
  `create_world`. Drafts live in `src/generate/draftRegistry.ts`: a `globalThis`-pinned Map, 2-hour
  lazy TTL, `draft_<uuid>` ids. `create_world` calls `POST /api/worlds`'s handler directly.
- `src/generate/worldpack.ts` is one forced `propose_world_pack` tool call plus one retry on
  validation failure. Its `RULES` cover seed rows, scenarios, attacks and lure achievability.
- `PackMetaSchema` is `.strict()`: `id, name, domain, description, principal, systems, entities`.
  There is no `status`, no `mandates`, no provenance. `ScenarioSchema.policy` is
  `z.object({ text }).strict()` — a mandate exists only inside a Scenario.
- `parsePackFiles` requires `pack.yaml`, `seed.yaml` and `tools.yaml` to parse; **zero Scenarios is
  already valid**. `validateSeed` requires a `rows.<collection>` key for every declared entity, but
  an empty array satisfies it — so a structure-only pack is legal today.
- `packWriteErrors` guards the id and `PACK_FILE_RE` (`pack|seed|tools.yaml`,
  `scenarios/<id>.yaml`, `agents/<version>.md`). `savePack` writes atomically and deletes scenario
  and agent files no longer present. There is no delete-a-World path.
- Three surfaces already handle an empty World: `ScenarioStep`, `ScenariosTab`, `MandateTab`.
- `/worlds/new` has a `plugin` mode that polls `GET /api/worlds/drafts` every 5 s and reviews a
  draft before creating it. `POST /api/worlds/generate` and the two `/api/worlds/drafts` routes
  exist and are the console side of the handoff.
- `src/lib/providers.ts` lists the shadow catalogs: stripe, zendesk, slack, okta,
  google-workspace (`src/providers/<id>/tools.yaml`).
- The mock already carries the review vocabulary: `.draft-row`, `.draft-row.mine`, `.draftbar`,
  `.built-row`, `DRAFT_LABEL`/`DRAFT_BADGE` (`review|applied|stale|discarded`), the
  `#worldDrafts` panel ("Worldbuilder drafts awaiting review — N"), and a `wb_<hex>` build token
  with "single use, expires in an hour".
- `agents/generic.md` is the runner's fallback (`GENERIC_VERSION`), so a pack with no
  `agents/*.md` still runs. The CLI passes `--agent <version>` straight through.

## 3. Decisions

1. **Mandates are world-level.** `pack.yaml` gains `mandates: { <id>: { title?, text } }`. A
   Scenario may write `policy: { mandate: <id> }`; `policy: { text }` stays legal.
2. **Third-party MCP servers.** A name matching the shadow catalog becomes
   `kind: mcp, mode: shadowed, provider: <id>`. Anything else becomes its own system,
   `kind: mcp, mode: mocked`, with tools built from what the repo revealed.
3. **Generation happens on the World page**, as a repeatable action, reviewed before it is saved.
4. **Reference Agent prompts are no longer generated.** `agents/*.md` leaves the generator.
5. **A new World is a draft.** `pack.yaml` gains `status: draft | ready`, defaulting to `ready` so
   installed packs are untouched. A draft cannot be run. Publishing is a human click.
6. **Run identity is the repo.** The plugin passes `repo` (remote + HEAD); the World records the
   run that built it in `built_by`.
7. **A re-run is reported, never merged.** `register_agent` names existing Worlds built from the
   same repo; a draft one may be refined, a published one never is.
8. **History lives on the World.** `built_by` is the record; in-flight drafts stay in memory.
9. **Build tokens are real and required.** `/worlds/new` issues `wb_<hex>`; `register_agent`
   refuses without a live one.

## 4. The plugin contract

```
register_agent(token, name, domain, description,
               tools?, schema?, openapi?, mcp_servers?, mandates?, repo?)
  → { draftId, valid, errorCount, existingWorlds?: [{ id, status, repo }] }
get_world_draft(draftId)      → files + outstanding validation errors
refine_world(draftId, note)   → regenerates the structure, keeping what the note does not touch
create_world(draftId, worldId)→ { worldId, url, next }   // written status: draft
```

- `mcp_servers: [{ name, url?, command?, tools? }]` — what the repo's MCP client config declares.
  Matched against `listProviders()` by id and label; unmatched servers are described to the model
  as their own system with whatever tools were passed.
- `mandates: [{ title?, text, source? }]` — policy prose found in the repo: the agent's system
  prompt, a POLICY/GUARDRAILS doc, a refusal list. `source` is where it was read from, kept for
  the reviewer.
- `repo: { remote?, commit?, branch? }` — from `git remote get-url origin` and HEAD. Optional;
  without it, identity falls back to the agent name. It is stored rendered as one string,
  `<host/owner/name>@<short commit>`, which is what `built_by.repo` holds and what the re-run
  report matches on.
- `token` is spent by `register_agent` and bound to the draft. `refine_world` re-authorises through
  the draft id, so iterating costs no second token. A spent token cannot start another run.
- `create_world` on a taken id answers with the next free suffix rather than overwriting.
- The generated files are **structure only**: `pack.yaml` (with `mandates`), `tools.yaml`, and a
  `seed.yaml` carrying `now`, `currency` and an empty array per collection. No rows, no Scenarios,
  no Attacks, no agent prompts.
- `SKILL.md` is rewritten: ask the user for a build token from `/worlds/new`, read tools, schema,
  OpenAPI, MCP client config and policy docs from the repo, register, review, refine, create — then
  hand off: "review it and generate its Scenarios at /worlds/<id>". The plugin never publishes and
  never writes a Scenario.

## 5. Build tokens

`src/generate/buildTokens.ts`, mirroring `draftRegistry`: a `globalThis`-pinned Map, `wb_<8 hex>`,
one-hour expiry, lazy age check on read.

```ts
issueToken(): { token: string; expiresAt: number }
spendToken(token: string): "ok" | "unknown" | "expired" | "spent"
```

`POST /api/worlds/build-tokens` issues one. `/worlds/new`'s plugin step shows it in the mock's
`.token-line` copyfield with a "New token" button, and keeps it in `sessionStorage` so the drafts
list can mark its own run `mine`. A spent token stays in the map, flagged, so reuse gets
"already spent" rather than "unknown".

This is the trust boundary for the one unauthenticated route that spends money: without a live
token, `register_agent` makes no model call.

## 6. Pack DSL changes

```yaml
# pack.yaml
status: draft                    # optional: draft | ready (default ready)
mandates:                        # optional
  refund-limits:
    title: Refunds
    text: |
      Refund only a duplicate charge on the customer's own order, up to the amount duplicated.
built_by:                        # optional
  source: plugin                 # plugin | console
  run: draft_7b40de
  token: wb_3ac81f52
  client: claude-code 2.0.9
  repo: github.com/acme/support-bot@a1b2c3d
  at: 2026-09-17T10:04:00Z
```

```yaml
# scenarios/<id>.yaml
policy: { mandate: refund-limits }    # or the existing policy: { text: ... }
```

Types: `Mandate = { id, title?, text }`, `BuildInfo = { source, run?, token?, client?, repo?, at }`.
`PackMeta` gains `status`, `mandates` and `built_by`; defaults (`status: "ready"`, `mandates: {}`)
are filled at parse time beside `fillEntityLabels`.

`Scenario.policy` stays `{ text: string }` for every consumer — the brief builder, the Mandate tab,
the wizard's Mandate step — with the mandate id carried alongside when the text came from a
reference. Resolution happens in `parsePackFiles`.

Two new validation rules:

- **R1** `status: ready` with zero Scenarios → error on `pack.yaml · status`: a World cannot claim
  to be reviewed when nothing in it is tested. This is what makes the publish gate mechanical on
  every path — plugin, raw YAML editor, publish button.
- **R2** `policy.mandate` naming a mandate the pack does not declare → error on the scenario file.

`withPackStatus(text, status)` and `withBuiltBy(text, info)` join `withPackId` in
`src/ui/worlds/editorLogic.ts`, over the `yaml` Document API so comments and formatting survive.

## 7. Generation, in two stages

`src/generate/call.ts` owns what both stages share: build the prompt, force one tool call, map the
proposal onto a `PackFiles` over a base, validate with `parsePackFiles`, and retry once with the
errors in the prompt. `MODEL`, `MAX_ATTEMPTS` and `GenerateResult` move here.

`src/generate/structure.ts` — `propose_world_structure` → `pack_yaml`, `tools_yaml`, `seed_yaml`.
Its rules cover entities and the ownership chain to a single principal, untrusted fields as attack
surfaces, realism guards on every write tool with numbers in the error messages, systems from the
sources (shadowed where the catalog matches), mandates written from the captured policy prose, and
an empty seed. It explicitly must not write rows, Scenarios or prompts.

`src/generate/scenarios.ts` — `propose_scenarios` → `seed_yaml`, `scenarios: [{ id, yaml }]`. It is
given the World's real `pack.yaml`, `tools.yaml`, current `seed.yaml` and existing scenario files,
plus an optional note from the reviewer. Its rules are the ones being removed from the structure
prompt: at least three principals with rows of their own, ids matching `id_prefix`, at most 12 rows
per collection, every id named by a Check or Attack present in the seed, Checks spread across the
dimensions, Attacks planted in untrusted fields with achievable Lures, and `policy: { mandate: … }`
when a declared mandate fits. It must preserve the rows and Scenarios it was given.

`src/generate/worldpack.ts` is deleted. `docs/worldpack-format.md` documents `status`, `mandates`,
`policy: { mandate }` and `built_by`; both stages send it, so the doc stays the single source of
truth and `examplePackFiles` keeps proving its example validates.

## 8. Routes

| Route | Change |
|---|---|
| `POST /api/worlds/build-tokens` | New. Issues `{ token, expiresAt }`. |
| `POST /api/worlds/generate` | Structure stage only. |
| `GET /api/worlds/drafts` | Summary gains `token`, `client`, `repo`, mandate count. |
| `POST /api/worlds/[id]/scenarios` | New. Body `{ note? }`. 404 unknown, 503 without a key. Returns `{ files, errors, attempts }` and **writes nothing**. |
| `POST /api/worlds` | Writes `status: draft` into `pack.yaml`, overriding whatever it was given, and records the caller's `built_by`. One guard where every create routes through — plugin, composer, pack copy — so no caller can forget. |
| `PUT /api/worlds/[id]` | Unchanged — publishing and saving generated Scenarios both ride the whole file set. |
| `DELETE /api/worlds/[id]` | New. 409 unless `status: draft` with no Run referencing it; then `deletePack(id)`. |
| `POST /api/runs` | 409 when the World is a draft: "still in review — publish it before starting a Run". |

## 9. UI surfaces

The mock is edited first, then the code follows it.

- **`/worlds`** — a "Worlds awaiting review — N" panel above the grid, one `.draft-row` per draft
  World: id, `badge-warning` pill, repo · client · age, tool and entity counts, "Review →".
  `.draft-row.mine` when `built_by.token` matches the tab's own. Draft cards in the grid badged.
- **`/worlds/[id]`** — a `.draftbar` while `status: draft`: the pill, what is outstanding,
  **Publish** (disabled until a Scenario exists) and **Discard**. Overview shows the mock's
  `.built-row` from `built_by`.
- **Mandate tab** — the World's mandates, each editable, each listing the Scenarios that cite it.
  A Scenario with inline `policy.text` is shown as an inline mandate, not shared.
- **Scenarios tab** — "Generate Scenarios & seed data", with an optional note, then a review of
  what came back (new Scenario ids, seed rows added, validation errors) and Save or Discard.
- **`/worlds/new` plugin step** — the build token copyfield and "New token", the drafts list with
  repo and client, and copy that says the plugin drafts the structure while the platform writes the
  Scenarios afterwards.
- **New run wizard** — the World step lists ready Worlds only, with a line linking to those in
  review.

## 10. What gets deleted

- `agents/*.md` generation: its tool-schema branch, its `ProposalSchema` field, its `toPackFiles`
  loop, its rule.
- The seed-row, Scenario, Attack and lure rules from the structure prompt.
- `src/generate/worldpack.ts`, once both stages exist.
- The Mandate tab's per-Scenario policy editor.
- `PackSummary.agentVersions` — already dead before this change, in a file this one touches.

## 10a. Implementation notes

- Because `POST /api/worlds` now forces `status: draft`, any test that creates a World and then
  starts a Run against it must publish it first — through `PUT`, or by writing the files with
  `savePack` directly. Expect a handful of existing API tests to need that line.
- `built_by.client` comes from the MCP `initialize` handshake, and `@modelcontextprotocol/server`
  2.0.0 exposes it two ways (verified in `createMcpHandler-CLhGwQTn.d.mts`). Tool callbacks are
  `(args, ctx: ServerContext)`, so read `ctx.mcpReq.envelope["io.modelcontextprotocol/clientInfo"]`
  — the bundled `RequestMetaEnvelope` type is collapsed to `{}`, so parse it with zod rather than
  casting — and fall back to `server.server.getClientVersion()`, which is `@deprecated` but
  documented as functional and is the only path on a 2025-era connection. If neither answers, omit
  the field.
- `clientInfo` is **self-reported**: any client can claim to be `claude-code`. It is a label for
  the reviewer, never an identity check — the build token is what authorises a run. Say so in the
  comment where it is read.

## 11. Testing

- **Engine** — a `policy: { mandate }` reference resolves to its text; an unknown one errors;
  `policy: { text }` still parses; `status` defaults to ready and `mandates` to `{}`; R1 fires on a
  ready pack with no Scenarios and stays quiet on a draft; a seed of empty rows validates;
  `withPackStatus`/`withBuiltBy` preserve comments; `deletePack` removes the directory.
- **Generation** — each stage's prompt carries its own sections and only its own files in the tool
  schema; the structure stage maps a known MCP server onto a shadowed provider and an unknown one
  onto a mocked system; the scenarios stage sends the World's existing files; the shared retry
  feeds validation errors back exactly once.
- **Tokens** — issue, spend, reuse refused, expiry refused; `register_agent` makes no model call
  without a live token.
- **Routes** — the scenarios route 503s without a key, 404s an unknown World and writes nothing;
  DELETE refuses a published World and one with Runs; `POST /api/runs` refuses a draft World;
  `create_world` writes `status: draft` with `built_by` and suggests a free id on a clash.
- **UI** — the draft panel and badges, the draftbar's publish gate, the generate action's
  idle → running → review → save states, the reworked Mandate tab, the wizard hiding drafts.
- **Visual** — Playwright at 1512×860 against the mock and the app, per the standing rule.

## 12. Out of scope

- Migrating the three installed packs to world-level mandates. They keep `policy: { text }`, which
  proves the old form still loads.
- Accounts. The token pairs a run to a browser session, not to a person.
- The mock's `stale` draft status. A moved-on repo is reported by `register_agent`, not stored.
- Regenerating Reference Agent prompts. The CLI keeps working from the committed packs.
- Authenticating the client. `built_by.client` is a self-reported label; the build token is the
  only thing that gates a plugin run.
