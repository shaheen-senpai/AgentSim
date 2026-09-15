// The DNS-rebinding guard shared by every /mcp/* route. One implementation, so /mcp/runs/[runId]
// and /mcp/worlds cannot drift the way a duplicated guard always eventually does.
import { hostHeaderValidationResponse, originValidationResponse, localhostAllowedHostnames, localhostAllowedOrigins } from "@modelcontextprotocol/server";

/**
 * Extra hostnames every /mcp/* endpoint will answer on, from `AGENTSIM_ALLOWED_HOSTS`
 * (comma-separated, no scheme, no port). Unset — the default — leaves the localhost-only allowlist
 * exactly as it was.
 *
 * The allowlist is DNS-rebinding protection: it is what makes a page on some other origin unable to
 * drive an MCP endpoint through the browser of whoever is running AgentSim. Naming a host here
 * disables that protection *for that host*, which is the price of letting an agent that is not on
 * this machine — behind a tunnel, or on a LAN address — reach it at all. Read at request time, so
 * it is an environment variable and not a build-time constant.
 */
export function extraAllowedHosts(): string[] {
  return (process.env.AGENTSIM_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim()).filter((h) => h.length > 0);
}

/** A 403 Response if `request`'s Host/Origin fail the allowlist, else `null`. */
export function guardMcpRequest(request: Request): Response | null {
  const extra = extraAllowedHosts();
  return (
    hostHeaderValidationResponse(request, [...localhostAllowedHostnames(), ...extra]) ??
    originValidationResponse(request, [...localhostAllowedOrigins(), ...extra]) ??
    null
  );
}
