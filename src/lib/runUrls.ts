// The URLs an external agent needs for a Run, derived from the request's own origin so a
// tunnel, a LAN address and localhost all hand out links that actually resolve for the caller.
//
// A Run publishes one MCP endpoint per source (`/mcp/runs/<id>/<sourceId>`), mirroring a real
// agent's MCP config, which already has one entry per provider — hence `mcpUrls`, keyed by source id.

export type RunUrls = { url: string; mcpUrl: string; callUrl: string; mcpUrls: Record<string, string> };

/** `sourceIds` are the keys of the Run's pack `meta.systems` — one MCP endpoint exists per source. */
export function runUrls(req: Request, id: string, sourceIds: string[]): RunUrls {
  const { origin } = new URL(req.url);
  const mcpUrls = Object.fromEntries(sourceIds.map((sourceId) => [sourceId, `${origin}/mcp/runs/${id}/${sourceId}`]));
  return {
    url: `${origin}/runs/${id}`,
    // Kept for clients that still read a single MCP server: the first source's endpoint. It resolves,
    // but publishes only that one source's tools — a client wanting the whole Run reads `mcpUrls`.
    mcpUrl: Object.values(mcpUrls)[0] ?? "",
    callUrl: `${origin}/api/runs/${id}/call`,
    mcpUrls,
  };
}
