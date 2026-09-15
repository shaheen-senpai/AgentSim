# MCP World-Builder: onboarding an agent via AgentSim's own MCP server

## Context

Today, connecting an agent to AgentSim only goes one direction: AgentSim
exposes a **pre-authored** World pack's tools to a BYO agent (Shape A: MCP at
`/mcp/runs/:id`; Shape B: forwarder at `/api/runs/:id/call`). Someone still
has to hand-author `pack.yaml`/`tools.yaml`/`seed.yaml` — or drive the
existing text-prompt generator (`src/generate/worldpack.ts`) — before any
Run can start. This adds the *reverse* onramp: AgentSim also runs as an MCP
**server** that a developer's own Claude Code session (or any MCP client)
connects to directly — the way a Figma plugin exposes tools Claude Code can
call — so that, on connecting, it can register the target agent, hand over
the agent's own tool schemas, and use that to **build a World pack
automatically**: entities for whatever the agent's tools touch, plus
stand-ins for the external APIs it depends on (e.g. Stripe-shaped payments),
without the user hand-writing YAML.

`docs/adr/0004-one-sim-core-two-adapters.md` explicitly ruled out "a
separate MCP server *process*" for the original build. A second **route** in
the same Next app — exactly how `/mcp/runs/[runId]` already exists — does
not conflict with that decision; this is not a process-topology change.

## Confirmed facts

- Per-Run MCP server: `src/app/mcp/runs/[runId]/route.ts`, built on
  `@modelcontextprotocol/server` v2.0.0, `createMcpHandler` with a
  per-request factory. Tools are built **dynamically per Run** from
  `live.pack.tools`, converted via `inputZod(tool)` (`src/engine/pack.ts`)
  into the MCP `inputSchema`. Every call funnels through
  `live.gateway.execute({ tool, input, source, batchId })`
  (`src/engine/gateway.ts`) — that choke point is for *Run* tool calls; the
  world-builder never touches it, since it authors packs rather than
  executing them against a live World.
- Connect page (`src/ui/connect/*`) today only lets a user register an
  **alias map** (`their_name: our_tool`) for a BYO agent — no tool schema is
  ever submitted. That is the gap this feature fills.
- `generateWorldPack` (`src/generate/worldpack.ts`) already accepts external
  input as text: `GenerateInput = { name, domain, description, schema?,
  tools?, openapi? }`. It forces one `propose_world_pack` tool call on
  `claude-opus-5`, validates the result through `parsePackFiles` (the same
  validator the editor/API use), and retries once with the errors in the
  prompt if invalid — always returning the last draft, valid or not. Today
  the only front door is a human pasting text into a `<textarea>` on
  `/worlds/new` ("Generate with Claude" mode). What's missing is only the
  live front door — nothing calls an MCP server to fetch this input.
- Third-party APIs are already modeled as ordinary in-World entities, not a
  separate construct. Northwind's `payments` system (`pack.yaml`, entities
  `payments`/`refunds`, `tools.yaml`) is a DSL-only stand-in for Stripe: a
  `system: payments` tag on tools, ordinary entities with a balance guard.
  The PRD's actual REST-shaped emulator concept (Shape C, generated from
  OpenAPI) is explicitly unbuilt (M3/large) — out of scope here. "Stripe
  etc. should be in our fake world" is satisfied the same way northwind
  already satisfies it.
- The filesystem write boundary is already hardened: `PACK_FILE_RE`,
  `packWriteErrors(id, files)`, `savePack` (atomic write). `POST
  /api/worlds` (`src/app/api/worlds/route.ts`) is a thin 17-line handler
  built entirely from exported engine functions (`packWriteErrors`,
  `parsePackFiles`, `savePack`, `listPackIds`) — small enough, and already
  proven callable directly as a function (`tests/api/mcp.test.ts` imports
  `POST as mcpRoute` and calls it with a constructed `Request`), that the
  new `create_world` MCP tool can call it directly rather than duplicating
  or extracting its logic.
- `mcpAddCommand(name, mcpUrl)` / `mcpJsonConfig(name, mcpUrl)`
  (`src/ui/connect/snippets.ts`) already take an arbitrary name + URL — they
  are not Run-scoped in signature, only in how the Connect page currently
  calls them. No snippet-builder changes are needed for a second server.
- `withPackId` / `isValidWorldId` (`src/ui/worlds/editorLogic.ts`) are pure
  (no `node:fs`), already imported into the client bundle, and safe to
  import server-side too — reused here rather than re-implemented.

## Design

### 1. What "onboarding via MCP" can and can't mean, given the protocol

MCP only lets a **server** expose tools to a **client** — a server cannot
reach into a connecting client and enumerate *its* tools. So registration
has to be an explicit first tool call the *client* makes, handing its own
tool list over as an argument. The developer's own Claude Code session
already knows its agent's tools; connecting to AgentSim's new MCP server and
calling `register_agent(tools: [...])` is the "Figma plugin" pattern: the
*target* app's session pushes its own manifest to the host over a tool
call, the host does not scrape it. The server's `instructions` (the same
mechanism `/mcp/runs/[runId]` uses to hand over the Task Brief at
`initialize`) tells the connecting client this directly.

### 2. New surface: `/mcp/worlds` — a second, stateless MCP server

Same library/pattern as `/mcp/runs/[runId]`, not scoped to a Run. Four
tools, each a thin wrapper over existing code:

| Tool | Args | Does | Returns |
|---|---|---|---|
| `register_agent` | `name, domain, description, tools?, schema?, openapi?` | Calls `generateWorldPack` with `tools` rendered to text, stores the result under a new `draftId` | `{ draftId, valid, errorCount }` |
| `refine_world` | `draftId, note` | Regenerates with the note plus the current draft's files in the prompt, so the model edits rather than starts blind | same shape |
| `get_world_draft` | `draftId` | Returns every file's current text plus outstanding errors | text |
| `create_world` | `draftId, worldId` | Stamps `worldId` into `pack.yaml`, calls `POST /api/worlds`'s handler directly | `{ worldId, url }` or validation errors |

A draft store (`src/generate/draftRegistry.ts`) holds `{ input, files,
errors, attempts, createdAt }` per `draftId` in a `globalThis`-pinned `Map`
(same reason as `src/runner/registry.ts`: `next dev` re-evaluates modules
per request). Lazily expired by age on read — no timer machinery, since a
draft has no external state to reconcile the way a live Run does.

### 3. Refinement changes the prompt, not just the retry loop

`refine_world` must let the model see what it already drafted, or it will
draft an unrelated pack from scratch each time. `buildPrompt` gains a
`refinement?: { note, previousFiles }` parameter, rendered as a "Current
draft" section (every file's current text) followed by "Requested change"
(the note) — a sibling to the existing `previousErrors` retry section, not
a replacement for it (the two can co-occur: refining a draft that still had
errors).

### 4. External-API stand-ins are a prompt rule, not new machinery

One new numbered rule in `RULES` (`src/generate/worldpack.ts`): when the
tool list or schema implies a third-party dependency for payments,
messaging, email or storage, model it as its own `system` with entities and
guarded tools in the existing DSL — spelled out with a concrete worked
shape (a `payments`/`refunds` pair and a balance-guarded `issue_refund`,
mirroring northwind) so the model has a pattern to imitate. No engine
change; no REST emulator.

### 5. Security / access control

`/mcp/worlds` reuses the exact DNS-rebinding Host/Origin guard already on
`/mcp/runs/[runId]`, extracted once into `src/lib/mcpAccess.ts` so the two
routes share one implementation rather than a second copy of the same
logic drifting from the first. `register_agent`'s `tools`/`schema`/`openapi`
inputs are the first MCP-reachable inputs in this codebase not already
bounded by a pack's own zod schemas, so they get explicit size caps.

### 6. UI: informational only, no new state management

A third mode on `/worlds/new`: "Connect your agent" — the `claude mcp add`
command + JSON config for `/mcp/worlds`, computed client-side from
`window.location.origin` (the panel lives in the existing client-island
`NewWorld.tsx`), using the existing unmodified `mcpAddCommand`/
`mcpJsonConfig`. No new draft-review UI: review happens in the calling
agent's own chat via `get_world_draft`'s returned YAML, and once
`create_world` runs, the result is an ordinary saved pack, editable via the
existing `/worlds/:id` → `PackEditor` like any other pack.

### Data flow (happy path)

```
Developer's Claude Code (has its own agent's tools already)
   │  claude mcp add --transport http agentsim-worldbuilder http://localhost:3000/mcp/worlds
   ▼
AgentSim /mcp/worlds  ──instructions──▶  "call register_agent first"
   │
   │  register_agent({name, domain, description, tools, schema?})
   ▼
generateWorldPack()  ──▶  parsePackFiles() validates  ──▶  draftRegistry stores draft
   │
   │  get_world_draft(draftId)  ──▶  YAML shown to the developer in-chat
   │  refine_world(draftId, note)  ──▶  regenerate with current draft + note, same validation
   ▼
create_world(draftId, worldId)
   │  POST /api/worlds handler: packWriteErrors + parsePackFiles + savePack
   ▼
worldpacks/<worldId>/ on disk  ──▶  { worldId, url: "/worlds/<worldId>" }
                                     ordinary pack, open in PackEditor or /connect to run it
```

## Out of scope

- Shape C REST emulators (OpenAPI-generated, auth/base-URL-aware) — PRD
  M3/large, unbuilt, unaffected by this work.
- Any change to `Agent`/`toolAliases` registration on the existing Connect
  page — the world-builder produces a World pack; connecting an agent to
  *run* a Scenario against it is still the existing `/connect` flow.
- Auth on `/mcp/worlds` beyond the existing Host/Origin allowlist — same
  documented gap as Shape A, carried forward rather than solved here.
