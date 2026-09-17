// The outbound counterpart of `mcpAccess.ts`. That guard stops a page on another origin driving a
// Run through the browser of whoever runs AgentSim; this one stops a registered agent's URL making
// AgentSim itself fetch somewhere it should not. Nothing authenticates `POST /api/agents`, so the
// URL we are asked to call is untrusted input, and an unguarded fetch is a server-side request
// forgery into whatever private network AgentSim happens to be running in.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Hostnames AgentSim will call an agent on, beyond this machine, from
 * `AGENTSIM_ALLOWED_AGENT_HOSTS` (comma-separated, no scheme, no port). Read at call time so it is
 * an environment variable rather than a build-time constant.
 */
export function allowedAgentHosts(): string[] {
  return (process.env.AGENTSIM_ALLOWED_AGENT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
}

/** The parsed URL, or a thrown Error naming exactly why it was refused. */
export function assertAgentUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`'${raw}' is not a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`'${raw}' must be an http or https URL`);
  }
  const host = url.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host) || allowedAgentHosts().includes(host)) return url;
  throw new Error(
    `'${host}' is not an allowed agent host. AgentSim calls agents on this machine by default; add the host to AGENTSIM_ALLOWED_AGENT_HOSTS to reach one elsewhere.`,
  );
}
