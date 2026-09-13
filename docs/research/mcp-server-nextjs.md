# MCP server over Streamable HTTP from a Next.js App Router route handler

Researched 2026-09-13 against primary sources only (MCP spec, the official TypeScript SDK repo/docs/published packages, the npm registry, Claude Code docs, Next.js docs). Everything marked **VERIFIED** was executed locally today; anything marked **UNVERIFIED** was not run.

## TL;DR

1. Use the **v2 SDK**: `npm i @modelcontextprotocol/server@2.0.0 zod@^4.2` and call `createMcpHandler(factory)`; `handler.fetch(request)` is a web-standard `(Request) => Promise<Response>`, so a Next route handler is just `export const POST = (req) => handler.fetch(req)`. No Node `req/res` adapter is needed.
2. The factory runs **once per HTTP request** and receives the inbound `Request`; derive `runId` from `requestInfo.url` (`/mcp/runs/{runId}`), look up that Run's World in a module-scope (`globalThis`) registry, and `registerTool(name, { description, inputSchema: z.object({...}) }, async (args) => ({ content: [{ type: 'text', text }] }))` for the ~10 tools.
3. The endpoint is **fully stateless**: MCP revision 2026-07-28 removed `Mcp-Session-Id`, the GET stream and the `initialize` handshake; the v2 handler also serves 2025-era clients per request with no session (`legacy: 'stateless'`, the default). Run identity lives in the URL, not in a session.
4. **Claude Code 2.1.270** connected to exactly this wiring with `claude mcp add --transport http agentsim http://127.0.0.1:3000/mcp/runs/<runId>` and reported `✔ Connected`; it negotiated the modern (2026-07-28) era via `server/discover`, then held a `subscriptions/listen` SSE stream open and called `tools/list`. No auth is required for a localhost server; add `--header "Authorization: Bearer ..."` if we want one.
5. The only thing not executed end-to-end is the Next.js mount itself (the project has no Next app yet); the same handler was verified in-process and behind `node:http`. Stay on `runtime = 'nodejs'` (edge is deprecated), never store per-Run state in the factory, and expect a long-lived SSE response per connected client.

---

## 1. Package name and current published version

There are now **two published server lines**, both cut on 2026-07-27:

| Line | Package | Latest (npm, 2026-09-13) | Implements |
| --- | --- | --- | --- |
| **v2 (recommended)** | `@modelcontextprotocol/server` | `2.0.0` | MCP 2026-07-28 *and* 2025-era clients from one factory |
| v1 (legacy) | `@modelcontextprotocol/sdk` | `1.30.0` | MCP 2025-11-25 and earlier (initialize handshake, sessions) |

- **VERIFIED** `npm view @modelcontextprotocol/server version` → `2.0.0` (created 2026-04-01, `latest` tag); `npm view @modelcontextprotocol/sdk version` → `1.30.0`. Companion v2 packages all at `2.0.0`: `@modelcontextprotocol/client`, `@modelcontextprotocol/core`, `@modelcontextprotocol/node`, `@modelcontextprotocol/hono`, `@modelcontextprotocol/express`, `@modelcontextprotocol/fastify`, `@modelcontextprotocol/server-legacy`, `@modelcontextprotocol/codemod`. Sources: https://www.npmjs.com/package/@modelcontextprotocol/server, https://www.npmjs.com/package/@modelcontextprotocol/sdk, https://github.com/modelcontextprotocol/typescript-sdk/releases
- The SDK docs call v2 "the stable release line" implementing the 2026-07-28 specification: https://ts.sdk.modelcontextprotocol.io/v2/
- `@modelcontextprotocol/server@2.0.0` `package.json`: `dependencies: { zod: "^4.2.0", "@modelcontextprotocol/core": "2.0.0" }`, `engines: { node: ">=20" }`; subpath exports are only `.`, `./stdio`, `./validators/ajv`, `./validators/cf-worker`. **VERIFIED** by inspecting the installed package.
- The repo keeps publishing 1.x patches from a `v1.x` branch ("The `v1.x` branch continues to publish `@modelcontextprotocol/sdk` 1.x under the same rules"): https://github.com/modelcontextprotocol/typescript-sdk/blob/main/VERSIONING.md
- Package layout guidance ("Most projects install exactly one of them"; the HTTP adapters `node`/`express`/`hono`/`fastify` are "thin layers over `createMcpHandler` and add no MCP behavior of their own"): https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/get-started/packages.md

**Why v2 for us:** Claude Code (our target client) already speaks 2026-07-28 by default (section 8), and v2 serves 2025-era clients from the same factory anyway, so there is no compatibility reason to start on v1.

## 2. The protocol changed underneath us: two eras

The current spec revision is **2026-07-28** ("The **current** protocol version is 2026-07-28"): https://modelcontextprotocol.io/specification/versioning

Key changes vs 2025-11-25 (quoted from the changelog, https://modelcontextprotocol.io/specification/2026-07-28/changelog):

- "Remove protocol-level sessions and the `Mcp-Session-Id` header from the Streamable HTTP transport. ... Servers that need cross-call state use explicit, server-minted handles passed as ordinary tool arguments (SEP-2567)."
- "Make MCP stateless: remove the `initialize`/`notifications/initialized` handshake. Every request now carries its protocol version and client capabilities in `_meta`".
- "Add `server/discover`: servers MUST implement this RPC to advertise their supported protocol versions".
- "Replace the HTTP GET endpoint and `resources/subscribe`/`resources/unsubscribe` with `subscriptions/listen`: a single long-lived POST-response stream".
- "Remove SSE stream resumability and message redelivery (the `Last-Event-ID` header and SSE event IDs)".
- "Require standard MCP request headers (`Mcp-Method`, `Mcp-Name`) on Streamable HTTP POST requests".

The SDK names the two behavior families **`legacy`** (`2024-10-07` … `2025-11-25`, opens with `initialize`) and **`modern`** (`2026-07-28`, `server/discover` + per-request `_meta`): https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/protocol-versions.md

Compatibility matrix (spec): "Legacy | Dual-era | Works. The server answers `initialize` and serves the client according to the negotiated legacy revision." and "Dual-era | Modern | Works." — https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning#backward-compatibility-with-initialization-based-versions . A v2 `createMcpHandler` server with the default `legacy: 'stateless'` is a dual-era server.

## 3. Streamable HTTP server entry point: class/function names, import paths, options

### v2 (recommended): `createMcpHandler` from `@modelcontextprotocol/server`

```ts
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
declare function createMcpHandler(factory: McpServerFactory, options?: CreateMcpHandlerOptions): McpHttpHandler;
type McpServerFactory = (ctx: McpRequestContext) => McpServer | Server | Promise<McpServer | Server>;
interface McpRequestContext { era: 'legacy' | 'modern'; authInfo?: AuthInfo; requestInfo?: Request; }
interface McpHttpHandler {
  fetch: (request: Request, options?: { authInfo?: AuthInfo; parsedBody?: unknown }) => Promise<Response>;
  close: () => Promise<void>; notify: ServerNotifier; bus: ServerEventBus;
}
interface CreateMcpHandlerOptions {
  legacy?: 'stateless' | 'reject';        // default 'stateless'
  onerror?: (error: Error) => void;
  responseMode?: 'auto' | 'sse' | 'json'; // default 'auto' (modern exchanges only)
  bus?: ServerEventBus; maxSubscriptions?: number; /* default 1024 */ keepAliveMs?: number; /* default 15000 */
}
```

- Signatures **VERIFIED** from `@modelcontextprotocol/server@2.0.0/dist/createMcpHandler-*.d.mts`. The `legacy` doc-comment: "`'stateless'` (the default ...) — each legacy request is answered by a fresh instance from the same factory over a streamable HTTP transport constructed with only `sessionIdGenerator: undefined` ... GET and DELETE (2025 session operations) are answered with `405`". `responseMode` doc: "`'auto'` (default) — a single JSON body unless the handler emits a related message before its result, in which case the response upgrades to an SSE stream."
- "`createMcpHandler` returns a `{ fetch }` object — the shape Cloudflare Workers, Deno, and Bun expect ... The deployed worker answers MCP requests on every path, with no Node adapter and no body middleware. The factory runs once per request": https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/web-standard.md
- "The factory runs once per HTTP request: a fresh instance serves every request, and the handler holds nothing between requests. Register tools, resources, and prompts inside the factory, never on a shared instance outside it. ... Keep the factory cheap and side-effect-free: create connection pools and caches once at module scope and close over them.": https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/http.md
- "The handler performs no `Host` or `Origin` validation ... Put the framework-agnostic response helpers in front of `fetch`": `hostHeaderValidationResponse`, `originValidationResponse`, `localhostAllowedHostnames()`, `localhostAllowedOrigins()` (all exported from `@modelcontextprotocol/server`): https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/web-standard.md
- Node adapter, if ever needed: `toNodeHandler(handler)` / `NodeStreamableHTTPServerTransport` from `@modelcontextprotocol/node` (**VERIFIED** exports). Not needed for Next route handlers.

### v1 (fallback only): `WebStandardStreamableHTTPServerTransport`

The v1 SDK **does** ship a fetch-compatible transport: `WebStandardStreamableHTTPServerTransport` at `@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js` ("This is the core transport implementation using Web Standard APIs (Request, Response, ReadableStream) ... Node.js 18+, Cloudflare Workers, Deno, Bun"), with `handleRequest(req: Request, options?): Promise<Response>`. `StreamableHTTPServerTransport` (`@modelcontextprotocol/sdk/server/streamableHttp.js`) is "a thin wrapper around `WebStandardStreamableHTTPServerTransport`" for Node `IncomingMessage/ServerResponse`. Options: `sessionIdGenerator?: () => string` ("If not provided, session management is disabled (stateless mode)"), `onsessioninitialized`, `onsessionclosed`, `enableJsonResponse`, `eventStore`, `retryInterval`, `keepAliveMs` (default 15000), plus deprecated `allowedHosts`/`allowedOrigins`/`enableDnsRebindingProtection`. **VERIFIED** from `@modelcontextprotocol/sdk@1.30.0/dist/esm/server/webStandardStreamableHttp.d.ts`. In v1 you must `new McpServer(...)`, `await server.connect(transport)`, and `transport.handleRequest(request)` **per request** in stateless mode (see `src/examples/server/simpleStatelessStreamableHttp.ts` on the `1.30.0` tag: https://github.com/modelcontextprotocol/typescript-sdk/blob/1.30.0/src/examples/server/simpleStatelessStreamableHttp.ts). v1 speaks only the legacy era; it cannot answer Claude Code's `server/discover` probe modernly (Claude Code then falls back to `initialize`, which works but loses nothing we need — still, no reason to pick it).

## 4. Tool registration API

Use **`registerTool`**; `tool()` is deprecated in v1 and removed in v2 ("`registerTool` replaces `tool()` — run the codemod": https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/tools.md).

v2 signature (**VERIFIED** from the `.d.mts`):

```ts
registerTool<OutputArgs extends StandardSchemaWithJSON, InputArgs extends StandardSchemaWithJSON | undefined = undefined>(
  name: string,
  config: { title?: string; description?: string; inputSchema?: InputArgs; outputSchema?: OutputArgs;
            annotations?: ToolAnnotations; icons?: Icon[]; _meta?: Record<string, unknown> },
  cb: ToolCallback<InputArgs>   // (args: InferOutput<InputArgs>, ctx: ServerContext) => CallToolResult | InputRequiredResult | Promise<...>
): RegisteredTool;
```

- **Schema shape:** pass a **zod object schema** (`inputSchema: z.object({ ... })`), not a raw shape. "`inputSchema` is a Zod schema — the only schema you write." and "Raw shapes (`inputSchema: { name: z.string() }`) are deprecated — pass a schema object." A deprecated raw-shape overload still exists in 2.0.0 and is auto-wrapped with `z.object()`. Sources: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/tools.md , https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/advanced/schema-libraries.md
- **Zod version:** "**Zod v3 is no longer supported** (v1 peer was `^3.25 || ^4.0`)"; import as `import * as z from 'zod/v4'` and use zod **≥ 4.2.0** (`~standard.jsonSchema` support): https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md (section "Standard Schema objects (raw shapes deprecated)"). Any Standard Schema that yields JSON Schema also works (ArkType as-is, Valibot via `@valibot/to-json-schema`, `fromJsonSchema()` for hand-written JSON Schema).
- **Return shape:** `{ content: [{ type: 'text', text }] }`; optional `structuredContent` validated against `outputSchema`; `isError: true` for tool-level failures. Content block types: `text`, `image`, `audio`, `resource_link`, embedded `resource`. Invalid arguments never reach the handler — the SDK returns `{ content: [{ type: 'text', text: 'Input validation error: ...' }], isError: true }` (**VERIFIED** in-process: `Input validation error: Invalid arguments for tool send_email: to: Invalid input: expected string`). Source: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/tools.md
- **Annotations** (`readOnlyHint`, `destructiveHint`, `idempotentHint`) are hints only; useful for our Payments tools so a host can gate `issue_refund` but auto-approve reads. Same source.
- A tool with no arguments omits `inputSchema`; the callback then receives only `ctx`.

## 5. Sessions, `Mcp-Session-Id`, and running fully stateless

**Spec, 2025-11-25 (legacy era):** "A server using the Streamable HTTP transport **MAY** assign a session ID at initialization time, by including it in an `MCP-Session-Id` header on the HTTP response containing the `InitializeResult`." Clients then "**MUST** include it ... on all of their subsequent HTTP requests"; servers requiring it "**SHOULD** respond ... with HTTP 400"; terminated sessions get 404; DELETE terminates, and "The server **MAY** respond to this request with HTTP 405". GET opens an optional server→client SSE stream, or the server "**MUST** ... return HTTP 405". Source: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

**Spec, 2026-07-28 (modern era):** "The server **MUST** provide a single HTTP endpoint path ... that supports POST." Sessions, GET stream, DELETE and `Last-Event-ID` are gone; for old traffic "HTTP GET or DELETE to the MCP endpoint: respond with `405 Method Not Allowed`. An `Mcp-Session-Id` header on a request: ignore it, and do not mint or echo session IDs." Every POST must carry `MCP-Protocol-Version`, `Mcp-Method`, and (for `tools/call`) `Mcp-Name` headers; the client's `Accept` must list `application/json` and `text/event-stream`; a request is answered with either one JSON object or a request-scoped SSE stream; closing the SSE response stream is the cancellation signal. Source: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http

**Can we run fully stateless per request? Yes — it is the default and the only mode of the v2 handler.** "`createMcpHandler` builds a fresh server instance from your factory for every HTTP request and holds nothing between requests, so a v2 server is stateless and scales horizontally by default" and "the 2026-07-28 revision is per-request and has no `Mcp-Session-Id`": https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/sessions-state-scaling.md . For legacy clients the handler answers `initialize` per request with **no** `Mcp-Session-Id` (**VERIFIED**: raw legacy `initialize` POST → `200`, `content-type: text/event-stream`, `mcp-session-id: null`, body `{"result":{"protocolVersion":"2025-11-25",...}}`; GET → `405`; DELETE → `405`).

**Where our state lives:** the Run's World is keyed by the `runId` path segment, which is exactly the spec's intended replacement for sessions ("explicit ... handles passed as ordinary tool arguments" — we pass it in the URL instead, which Claude Code supports because the server URL is per-connection). If we ever need sessions (e.g. per-agent identity within one Run), that is the hand-wired v1-style `NodeStreamableHTTPServerTransport` + `sessionIdGenerator` route described in sessions-state-scaling.md — not needed for the hackathon.

## 6. Minimal Next.js App Router route handler

Two files. The registry is separate so the World survives `next dev` re-evaluating the route module (see gotchas).

```ts
// lib/world-registry.ts
import type { World } from './world';                 // our World class: `execute(tool, args)` + event log

type Registry = Map<string, World>;
const g = globalThis as unknown as { __agentsimWorlds?: Registry };
export const worlds: Registry = (g.__agentsimWorlds ??= new Map());   // survives HMR module re-evaluation (UNVERIFIED — see §7)

export function getWorld(runId: string): World | undefined {
  return worlds.get(runId);
}
```

```ts
// app/mcp/runs/[runId]/route.ts
import {
  createMcpHandler, McpServer,
  hostHeaderValidationResponse, originValidationResponse,
  localhostAllowedHostnames, localhostAllowedOrigins,
} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { getWorld } from '@/lib/world-registry';

export const runtime = 'nodejs';           // default; 'edge' is deprecated in Next 16 — do not set it
export const dynamic = 'force-dynamic';    // belt-and-braces; GET route handlers are dynamic by default since Next 15

function runIdFromUrl(url: string): string {
  // /mcp/runs/{runId}  -> the last non-empty path segment
  return new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
}

// One handler for the whole route. The factory runs once per HTTP request and
// receives the inbound Request as `requestInfo`; derive the Run from the URL.
const handler = createMcpHandler(
  ({ requestInfo, era }) => {
    const runId = runIdFromUrl(requestInfo!.url);
    const world = getWorld(runId);
    if (!world) throw new Error(`Unknown run ${runId}`);   // surfaces as a JSON-RPC error; see the 404 guard below for a cleaner HTTP answer

    const server = new McpServer({ name: 'agentsim', version: '0.1.0' });

    // One registerTool per System tool (~10 total). All handlers funnel through world.execute.
    const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v) }] });

    server.registerTool(
      'send_email',
      { description: 'Send an email from the company mailbox',
        inputSchema: z.object({ to: z.string().email(), subject: z.string(), body: z.string() }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
      async (args) => text(await world.execute('send_email', args)),
    );
    server.registerTool(
      'get_ticket',
      { description: 'Read one support ticket by id',
        inputSchema: z.object({ ticketId: z.string() }),
        annotations: { readOnlyHint: true } },
      async (args) => text(await world.execute('get_ticket', args)),
    );
    server.registerTool(
      'issue_refund',
      { description: 'Refund an amount (GBP) against an order',
        inputSchema: z.object({ orderId: z.string(), amount: z.number().positive() }),
        annotations: { destructiveHint: true } },
      async (args) => text(await world.execute('issue_refund', args)),
    );
    // ... remaining Email / Support / Orders / Payments tools follow the same 6-line pattern

    void era; // 'modern' for Claude Code ≥2.1.232, 'legacy' for 2025-era clients — same tools either way
    return server;
  },
  { onerror: (e) => console.error('[mcp]', e) },
);

async function serve(request: Request): Promise<Response> {
  // The handler does no Host/Origin validation itself (DNS-rebinding guard per spec §Security).
  // localhostAllowed* only allow localhost/127.0.0.1/[::1]; widen this if the server is exposed via a tunnel.
  const rejected =
    hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
    originValidationResponse(request, localhostAllowedOrigins());
  if (rejected) return rejected;

  if (!getWorld(runIdFromUrl(request.url))) {
    return Response.json({ jsonrpc: '2.0', error: { code: -32600, message: 'Unknown run' }, id: null }, { status: 404 });
  }
  return handler.fetch(request);           // NextRequest extends Request; pass it straight through
}

export const POST = serve;    // all MCP traffic (JSON-RPC requests/notifications, SSE responses)
export const GET = serve;     // v2 handler answers 405 — legacy standalone SSE stream is not offered (spec-allowed)
export const DELETE = serve;  // v2 handler answers 405 — there are no sessions to terminate (spec-allowed)
```

Why each piece is there:

- Route handler signature, `Request`/`Response` are Web APIs, supported methods `GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS`, `OPTIONS` auto-implemented, body read via `request.json()` with no `bodyParser` config ("Notably, unlike API Routes with the Pages Router, you do not need to use `bodyParser`"), streaming by returning a `Response` whose body is a `ReadableStream`: https://nextjs.org/docs/app/api-reference/file-conventions/route
- `params` (if you prefer it over URL parsing) is `Promise<{ runId: string }>` as the second argument since Next 15 (`const { runId } = await params`): same page, "Version History: `v15.0.0-RC` `context.params` is now a promise". Not used above because the factory only sees the `Request`, and parsing the URL keeps the 404 guard and the factory consistent.
- `handler.fetch` answers "on every path", so mounting it under a dynamic segment is fine: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/web-standard.md
- `requestInfo` is the "original HTTP request being served" (**VERIFIED** `requestInfo instanceof Request === true` inside the factory).
- Host/Origin guards: spec says "Servers **MUST** validate the `Origin` header on all incoming connections to prevent DNS rebinding attacks" and "**SHOULD** bind only to localhost": https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#security--endpoint ; helper names from https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/web-standard.md#protect-against-dns-rebinding . Non-browser clients (Claude Code) send no `Origin`, and "a request without an `Origin` header always passes".
- Optional bearer auth: verify the token yourself and pass `handler.fetch(request, { authInfo })`; the SDK "never derives auth from request headers". `requireBearerAuth({ verifier })` from `@modelcontextprotocol/server` returns either an `AuthInfo` or a ready-made 401 `Response` — see https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/bearer-auth-web/server.ts

**Verification status of this code:**

- **VERIFIED (in-process, Node 20+, zod 4.6.4):** the same `createMcpHandler` factory-per-run wiring driven by (a) the v1 SDK 1.30.0 client (legacy `initialize` handshake) against `/mcp/runs/run-A`, (b) the v2 client with `versionNegotiation: { mode: 'auto' }` against `/mcp/runs/run-B` (negotiated `modern`), (c) a v2 client in default legacy mode returning to `run-A` and seeing the earlier event. Per-run isolation held (`run-A` 1 event, `run-B` 1 event). Raw `GET`/`DELETE` → 405.
- **VERIFIED (real Claude Code 2.1.270 → `node:http` mount via `toNodeHandler`):** see §8.
- **UNVERIFIED:** the Next.js mount itself (no Next app exists in the repo yet). Smoke test once it does:
  `curl -s -X POST http://localhost:3000/mcp/runs/<runId> -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` — expect `event: message` + `data: {"result":{"tools":[...` (this is the curl the SDK docs use: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/web-standard.md#run-it-and-verify). Note that a body-less legacy `tools/list` is served through the legacy stateless leg; Claude Code's modern requests carry `_meta` and the `Mcp-*` headers itself.

## 7. Known Next.js gotchas

1. **Body parsing:** none. Route handlers hand you a Web `Request`; `handler.fetch` calls `request.json()` itself. Do not pre-read the body (a consumed body would break the handler); if some middleware must, pass it as `handler.fetch(req, { parsedBody })`. Source: https://nextjs.org/docs/app/api-reference/file-conventions/route#request-body and `McpHandlerRequestOptions.parsedBody` (**VERIFIED** type).
2. **Streaming SSE responses:** returning `new Response(readableStream)` streams from route handlers ("You can also use the underlying Web APIs directly": https://nextjs.org/docs/app/api-reference/file-conventions/route#streaming). The v2 handler produces exactly that. Claude Code opens a **long-lived** `subscriptions/listen` SSE response per connection (observed, §8) and the handler emits an SSE keep-alive comment every 15 s (`keepAliveMs` default). This is fine under `next dev`/`next start` on a Node host; on serverless hosting it is bounded by `maxDuration` ("Deployment platforms can use `maxDuration` from the Next.js build output to add specific execution limits": https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/maxDuration).
3. **Runtime:** keep the default Node runtime. "`'edge'` (deprecated)" and "The Edge Runtime is deprecated. Remove the `runtime` export from your route files": https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/runtime . The v2 server root entry is runtime-neutral, but there is no reason to fight a deprecated runtime during a hackathon.
4. **`export const dynamic`:** GET route handlers have been dynamic by default since Next 15 ("The default caching for `GET` handlers was changed from static to dynamic" — https://nextjs.org/docs/app/api-reference/file-conventions/route#version-history). `export const dynamic = 'force-dynamic'` is still valid without Cache Components and is harmless insurance; with `cacheComponents` enabled in Next 16 the `dynamic` segment config is removed, so drop the line in that configuration: https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config and https://nextjs.org/docs/app/guides/caching-without-cache-components#dynamic
5. **Module-scope state under `next dev`:** Next's docs only document Fast Refresh for client modules ("If you edit a file with exports that *aren't* React components, Fast Refresh will re-run both that file, and the other files importing it": https://nextjs.org/docs/architecture/fast-refresh). **UNVERIFIED from primary docs** that server route modules are re-evaluated on edit, but it is the common experience; the `globalThis` registry in §6 makes the World registry survive re-evaluation either way. Full process restarts still wipe it — keep Runs re-creatable from their Scenario seed.
6. **Unsupported methods:** Next returns 405 for methods you don't export; the SDK already answers 405 for GET/DELETE, so exporting them (as above) only matters for making the JSON-RPC-shaped 405 come from the SDK instead of a bare Next 405. Either is spec-compliant.
7. **CORS:** not needed for Claude Code (server-side client). Only add CORS headers if a browser-based agent connects: https://nextjs.org/docs/app/api-reference/file-conventions/route#cors

## 8. Claude Code as the client

**Exact command (VERIFIED against a local server, output copied verbatim):**

```bash
claude mcp add --transport http agentsim http://127.0.0.1:3000/mcp/runs/<runId>
# Added HTTP MCP server agentsim with URL: http://127.0.0.1:3000/mcp/runs/<runId> to local config

claude mcp get agentsim
# agentsim:
#   Scope: Local config (private to you in this project)
#   Status: ✔ Connected
#   Type: http
#   URL: http://127.0.0.1:3000/mcp/runs/<runId>

claude mcp list
# Checking MCP server health…
# agentsim: http://127.0.0.1:3000/mcp/runs/<runId> (HTTP) - ✔ Connected

claude mcp remove agentsim      # `-s local` is the default scope
```

(Test ran with port `3939` and `runId=run-1`; the server log recorded, in order: `era=modern mcp-method=server/discover proto=2026-07-28`, `subscriptions/listen`, `tools/list` — once for `add`'s health check and once for `list`.)

- Syntax and flags: `claude mcp add --transport http <name> <url>`; `--header "Authorization: Bearer your-token"` (short forms `-t`, `-H`, `-s`); scopes `-s local` (default, private to you in this project), `-s project` (writes `.mcp.json` for the repo), `-s user`; the `--` separator is only for stdio commands. Source: https://code.claude.com/docs/en/mcp
- `.mcp.json` shape for a project-scoped entry (`type` is required — "Entries with `url` but no `type` are treated as stdio servers"):
  ```json
  { "mcpServers": { "agentsim": { "type": "http", "url": "http://127.0.0.1:3000/mcp/runs/${RUN_ID}", "headers": { "Authorization": "Bearer ${AGENTSIM_TOKEN}" } } } }
  ```
  Env-var expansion (`${VAR}`, `${VAR:-default}`) is supported in `url` and `headers`. Source: https://code.claude.com/docs/en/mcp
- Verify inside a session with `/mcp` (shows `✔ Connected` / `! Needs authentication` / `✘ Failed to connect`). Tools appear as `mcp__agentsim__send_email` etc. (`mcp__<server>__<tool>`). Source: https://code.claude.com/docs/en/mcp
- **Auth:** none required for a localhost HTTP server (verified above with no header). Options if we add one: static `--header`, `headersHelper` script in `.mcp.json`, or OAuth (`/mcp` flow, `claude mcp login <name>`). Source: https://code.claude.com/docs/en/mcp
- **Protocol era Claude Code speaks:** "On Claude Code v2.1.232 or later, Claude Code uses the v2 runtime" built on "MCP TypeScript SDK 2.0 ... which adds MCP protocol revision 2026-07-28", and on v2 it "Asks HTTP and claude.ai connector servers whether they support the newer revision, and uses it with those that do" — i.e. `server/discover` first, `initialize` fallback. It also "Receives `list_changed` notifications from servers on the newer revision over a stream it holds open" (that is the `subscriptions/listen` stream we observed). Pin with `MCP_SDK_GENERATION=v1|v2`, `MCP_PROTOCOL_NEGOTIATION=auto|legacy`. Sources: https://code.claude.com/docs/en/mcp#mcp-client-runtimes , https://code.claude.com/docs/en/env-vars . Local install is `2.1.270` (**VERIFIED** `claude --version`). If a teammate runs `MCP_SDK_GENERATION=v1`, our v2 handler still serves them via the stateless legacy leg (verified in-process with the 1.30.0 client).
- **SSE transport:** "The SSE (Server-Sent Events) transport is deprecated. Use HTTP servers instead" and "Claude Code tries the HTTP transport first and switches to SSE when the server doesn't accept it." Use `--transport http`, never `--transport sse`. Source: https://code.claude.com/docs/en/mcp
- **Timeouts:** `MCP_TIMEOUT` (startup, default 30000 ms); `MCP_TOOL_TIMEOUT` (tool execution, default ~28 h) but "For an HTTP, SSE, or claude.ai connector server, each request also times out after 60 seconds by default; set this variable, or the per-server `timeout`, above 60000 to raise that per-request limit." Keep World tool calls fast. Source: https://code.claude.com/docs/en/env-vars

## 9. What was actually executed (evidence)

All in the session scratchpad, nothing written into the project besides this file:

1. `npm view` on the nine `@modelcontextprotocol/*` packages; installed `@modelcontextprotocol/server@2.0.0`, `@modelcontextprotocol/node@2.0.0`, `@modelcontextprotocol/hono@2.0.0`, `@modelcontextprotocol/client@2.0.0`, `@modelcontextprotocol/sdk@1.30.0`, `zod@4.6.4`; read the shipped `.d.ts`/`.d.mts` for the signatures quoted above.
2. `verify.mjs`: `createMcpHandler` with a per-`runId` factory over an in-memory World map, driven in-process (custom `fetch`) by a v1 legacy client, a v2 auto-negotiating client, and a v2 default (legacy) client; plus raw `GET`/`DELETE`/legacy-`initialize` requests. All assertions in §5/§6 come from its output.
3. `server.mjs`: the same handler behind `createServer(toNodeHandler(handler)).listen(3939, '127.0.0.1')`; then `claude mcp add/get/list/remove` from Claude Code 2.1.270; server log captured the request sequence and `era=modern`. The temporary `agentsim-probe` entry was removed from `~/.claude.json` afterwards.

## 10. Risks for a 48h hackathon

1. **API churn / two SDK lines.** v2.0.0 is seven weeks old; most third-party snippets online still show v1 (`StreamableHTTPServerTransport`, `server.tool`, raw zod shapes, `Mcp-Session-Id` maps). Do not mix: only `@modelcontextprotocol/server` imports, `registerTool`, `z.object`, `zod/v4`, zod ≥ 4.2. If someone pastes v1 code, `npx @modelcontextprotocol/codemod` exists but budget the time.
2. **The Next mount is the one unverified step.** First task on the Next side: create the route, run the §6 curl, then `claude mcp add`. If `handler.fetch(request)` misbehaves under Next's `NextRequest`, the escape hatch is `handler.fetch(new Request(request.url, { method, headers, body: await request.text() }))`.
3. **In-memory Worlds evaporate.** `next dev` module re-evaluation (mitigated by `globalThis`) and any process restart wipe the registry mid-Run. Make Runs lazily re-seedable from the Scenario, or the agent's next tool call 404s. Decide early whether a 404 or an auto-reseed is the demo-safe behavior.
4. **One long-lived SSE stream per connected Claude Code, plus 15 s keep-alives.** Fine locally; a pain on serverless (`maxDuration`) and behind buffering proxies. If we tunnel for the "connect your agent" encore, prefer a plain TCP/HTTP tunnel and set `keepAliveMs` low; the spec also recommends `X-Accel-Buffering: no` for nginx-type proxies.
5. **Host/Origin allow-list will 403 the demo if the URL isn't localhost.** `localhostAllowedHostnames()` only admits `localhost`/`127.0.0.1`/`[::1]`. If a judge's laptop or an ngrok host connects, add its hostname to `hostHeaderValidationResponse(request, [...])` (port-agnostic hostnames) or the connection silently fails with 403.
6. **Concurrency inside a Run.** Claude Code can issue tool calls concurrently; the factory-per-request model means two `tools/call` POSTs can interleave inside `world.execute`. Keep `execute` synchronous or serialize per Run (a per-run promise queue) so the Event log ordering and Action Rules are deterministic.
7. **Legacy leg answers GET/DELETE with 405 and offers no server→client notifications.** Irrelevant for Claude Code ≥ 2.1.232 (modern), but a 2025-era third-party agent that insists on the GET stream will see 405 (spec-allowed) and simply won't get push notifications. We don't send any, so accept it.
8. **Claude Code's 60 s per-request HTTP timeout.** Any tool that blocks (e.g. simulating slow payments) must return well under 60 s or the client aborts; raise via per-server `timeout` in `.mcp.json` only if needed.
9. **Per-request factory cost.** Ten `registerTool` calls plus JSON-Schema derivation run on every HTTP request. Cheap, but never seed a World or do I/O inside the factory; look up, don't create.
10. **Tool-name and schema hygiene.** Tool names become `mcp__agentsim__<name>`; keep them snake_case ASCII (spec's `Mcp-Name` header is ASCII-preferred). Every `.describe()` is the only documentation the model sees — write them for the agent, not for us.
