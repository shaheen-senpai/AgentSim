// The three URLs an external agent needs for a Run, derived from the request's own origin so a
// tunnel, a LAN address and localhost all hand out links that actually resolve for the caller.

export type RunUrls = { url: string; mcpUrl: string; callUrl: string };

export function runUrls(req: Request, id: string): RunUrls {
  const { origin } = new URL(req.url);
  return {
    url: `${origin}/runs/${id}`,
    mcpUrl: `${origin}/mcp/runs/${id}`,
    callUrl: `${origin}/api/runs/${id}/call`,
  };
}
