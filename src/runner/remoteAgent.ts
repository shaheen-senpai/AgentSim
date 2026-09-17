// Shape "driven": AgentSim calls the agent, rather than waiting for the agent to call AgentSim.
//
// Every other integration is inbound — an MCP client connects, or the agent's own loop forwards its
// tool calls here — which means binding one requires touching the agent's deployment. A shared
// staging agent cannot have its tool URLs repointed just for a Run. This inverts that: the team
// exposes one HTTP entry point, and AgentSim drives it.
//
// Deliberately not wired to the gateway yet: this carries the Task Brief out and the reply back, so
// the round trip is real, and nothing is scored from it. Tool interception is the next step, and it
// is what turns a reply into Events.
import { assertAgentUrl } from "@/lib/agentEndpoint";
import type { ConversationTurn } from "./counterpart";

/** What AgentSim sends. The wrapper answers with `{ reply }`. */
export type DriveRemoteOptions = {
  runId: string;
  taskBrief: string;
  /** The exchange so far, oldest first. Empty on a Scenario with no counterpart. */
  messages?: readonly ConversationTurn[];
  /** Full header value, e.g. `Bearer …`, resolved from the environment — never stored on disk. */
  authHeader?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export const DEFAULT_AGENT_TIMEOUT_MS = 120_000;

function replyOf(body: unknown): string {
  if (body && typeof body === "object" && typeof (body as { reply?: unknown }).reply === "string") {
    return (body as { reply: string }).reply;
  }
  throw new Error(`The agent's response has no \`reply\` string: ${JSON.stringify(body).slice(0, 200)}`);
}

/** POSTs the Task Brief to the agent and returns what it said. Throws with the cause on any failure. */
export async function driveRemoteAgent(url: string, opts: DriveRemoteOptions): Promise<{ reply: string }> {
  const target = assertAgentUrl(url); // before any request: a refused host must never be fetched
  const doFetch = opts.fetchImpl ?? fetch;

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.authHeader) headers.authorization = opts.authHeader;

  const res = await doFetch(target.href, {
    method: "POST",
    headers,
    body: JSON.stringify({ runId: opts.runId, taskBrief: opts.taskBrief, messages: opts.messages ?? [] }),
    // `assertAgentUrl` vetted the URL we were handed; following a redirect would fetch a URL nobody
    // vetted. Default `follow` would let an allowed endpoint bounce this request onto cloud
    // metadata or a private address and hand the body back through the Run, so 3xx is a failure.
    redirect: "manual",
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS),
  });

  if (res.status >= 300 && res.status < 400) {
    throw new Error(`The agent redirected (${res.status} to '${res.headers.get("location") ?? "?"}'). AgentSim does not follow a redirect: point it at the final URL.`);
  }

  const text = await res.text();
  if (!res.ok) throw new Error(`The agent returned ${res.status}: ${text.slice(0, 300)}`);

  try {
    return { reply: replyOf(JSON.parse(text)) };
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error(`The agent did not return JSON: ${text.slice(0, 200)}`);
    throw e;
  }
}
