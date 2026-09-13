# 01 — MCP server for the sim inside a Next.js route handler

Type: research
Status: resolved
Blocked by: —

## Question

How do we expose the sim's ~10 tools (Email/Support/Orders/Payments over one World) as an **MCP server over Streamable HTTP** from a **Next.js App Router route handler** in TypeScript, using the official `@modelcontextprotocol/sdk`, such that:

1. an external agent connects to a **per-Run URL** (e.g. `/mcp/runs/{runId}`) so each Run has its own World and Event log;
2. tools are registered with zod input schemas and handlers that call `world.execute(tool, args)`;
3. it works in Next's request/response model — stateless per request, or a stateful transport held in module scope during `next dev`;
4. **Claude Code** can be pointed at it as a client (exact `claude mcp add ...` invocation for an HTTP server) — this is the "connect your agent" encore.

Needed: exact package name and current version; the Streamable HTTP transport class and its constructor options; the tool-registration API (`registerTool` vs `tool`, schema shape); how sessions/`Mcp-Session-Id` work and whether we can run stateless; a minimal working route-handler example; any known Next.js gotchas (body parsing, streaming responses, edge vs node runtime). Primary sources only: the MCP spec, the TypeScript SDK repo/README, Claude Code MCP docs.

Write findings to `/docs/research/mcp-server-nextjs.md`.

## Answer

- Use the v2 SDK: `@modelcontextprotocol/server@2.0.0` (+ `zod@^4.2`, import `zod/v4`), not `@modelcontextprotocol/sdk` 1.30.0. Both were published 2026-07-27; v2 implements the current spec revision 2026-07-28, which removed `Mcp-Session-Id`, the GET stream and the `initialize` handshake.
- `createMcpHandler(factory)` returns `{ fetch }` where `fetch(request: Request) => Promise<Response>`; a Next route handler is `export const POST = (req) => handler.fetch(req)` (also export GET/DELETE; the SDK answers 405). No Node req/res adapter needed. Server registers tools with `server.registerTool(name, { description, inputSchema: z.object({...}) }, async (args) => ({ content: [{ type: 'text', text }] }))`.
- The factory runs once per HTTP request and receives `requestInfo: Request`; parse `runId` from `/mcp/runs/{runId}`, look up the World in a `globalThis`-backed registry, register the ~10 tools over `world.execute`. Fully stateless; legacy 2025-era clients are served per request with no session (`legacy: 'stateless'` default).
- Put `hostHeaderValidationResponse` / `originValidationResponse` (from the same package) in front of `handler.fetch`; keep `runtime = 'nodejs'` (edge deprecated).
- Claude Code: `claude mcp add --transport http agentsim http://127.0.0.1:3000/mcp/runs/<runId>`; verify with `claude mcp get agentsim` / `claude mcp list` / `/mcp`. No auth needed on localhost; `--header "Authorization: Bearer ..."` if we add one. Verified end-to-end with Claude Code 2.1.270 against a node:http mount of the same handler: `✔ Connected`, negotiated 2026-07-28 via `server/discover`, holds a `subscriptions/listen` SSE stream open.
- Only the Next.js mount itself is UNVERIFIED (no Next app in repo yet); the handler was verified in-process with v1-legacy and v2-modern clients and per-run isolation held.

Findings: docs/research/mcp-server-nextjs.md
