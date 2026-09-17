import { assertAgentUrl } from "@/lib/agentEndpoint";
import { getAgent } from "@/runner/agentRegistry";
import type { BridgeProbe } from "@/workspace/run/bridge";

export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 4_000;

/**
 * Is this agent's endpoint answering right now? "I am not sure whether the bridge is running" is
 * the question every empty Run starts with, and it is cheaper to answer than to debug afterwards.
 *
 * The probe is a POST, because that is what a Run does — a GET would prove the port is open and
 * nothing else. It deliberately omits `taskBrief`, so a conforming endpoint rejects it on the spot
 * (`400`) without ever reaching a model: this must cost nothing to press. Any HTTP answer at all,
 * including an error, means the endpoint is up; only a throw means it is not there.
 *
 * `assertAgentUrl` is the same SSRF guard the real call goes through, so this cannot be used to
 * reach anywhere a Run could not.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) return Response.json({ error: "Unknown agent" }, { status: 404 });

  const probe = async (): Promise<BridgeProbe> => {
    if (agent.shape !== "driven" || agent.url.trim() === "") {
      return { reachable: false, detail: "No endpoint is registered for this agent, so AgentSim has nothing to call." };
    }
    let url: URL;
    try {
      url = assertAgentUrl(agent.url.trim());
    } catch (e) {
      return { reachable: false, detail: e instanceof Error ? e.message : String(e) };
    }
    try {
      const res = await fetch(url.href, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ probe: true, runId: "bridge-probe" }),
        redirect: "manual",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      return { reachable: true, detail: `${url.host} answered (HTTP ${res.status}).` };
    } catch (e) {
      const cause = (e as { cause?: { code?: string } }).cause?.code;
      const why = e instanceof Error && e.name === "TimeoutError" ? `did not answer within ${PROBE_TIMEOUT_MS / 1000}s` : cause ? `refused the connection (${cause})` : "could not be reached";
      return { reachable: false, detail: `${url.host} ${why}. Is the endpoint running?` };
    }
  };

  return Response.json(await probe());
}
