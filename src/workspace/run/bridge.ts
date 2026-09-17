// The Bridge, in one vocabulary.
//
// A Run only records Events when the agent's tool calls actually reach this Run's Gateway. There
// are two ways that happens, and exactly one of them is a bridge:
//
//   bridge — AgentSim POSTs `{ runId, taskBrief, messages }` to an endpoint the team already runs,
//            and the agent executes its tool calls against `GET /api/runs/:id/tools` and
//            `POST /api/runs/:id/call` instead of against its own world. Nothing about the agent's
//            deployment is repointed; it is handed a runId and it calls back.
//   mcp    — the agent connects to us: its MCP client is pointed at this Run's per-source URLs.
//
// Both end in the same Gateway. The difference is who dials, which is the only thing a person on
// the Run page actually needs to know when nothing is happening.
//
// Pure: no fetch, no React, no `node:`. `runHint` is the point of the module — "no Events yet" has
// four very different causes and the page has to name the right one. `tests/workspace/bridge.test.ts`
// pins each branch.
import type { Agent, Event, FinishedBy, RunAgentRef, RunStatus } from "@/ui/types";

/** What `GET /api/agents/:id/bridge` answers: is that endpoint accepting requests right now? */
export type BridgeProbe = { reachable: boolean; detail: string };

export type Connection = { kind: "bridge"; url: string } | { kind: "mcp" };

/** How this agent gets into a Run. A driven agent with no URL cannot be called, so it is not a bridge. */
export function connectionOf(agent: Pick<Agent, "shape" | "url">): Connection {
  return agent.shape === "driven" && agent.url.trim() !== "" ? { kind: "bridge", url: agent.url.trim() } : { kind: "mcp" };
}

/** The same question for a Run, whose agent was copied onto it when it started. */
export function runConnection(agent: RunAgentRef): Connection["kind"] {
  return agent.kind === "byo" && agent.shape === "driven" ? "bridge" : "mcp";
}

export type RunHint = { tone: "info" | "warn" | "danger"; title: string; body: string };

type HintRun = { status: RunStatus; error: string | null; events: Pick<Event, "seq">[]; finishedBy: FinishedBy | null };

/**
 * The one sentence the Run page owes the reader right now, or null when the Events speak for
 * themselves. Ordered by what is actionable: a broken bridge first, then nothing-connected, then a
 * Run that finished with nothing to grade — the case that reads as "the agent did nothing" but is
 * almost always "the agent ran against its own world and we never saw it".
 */
export function runHint(run: HintRun, connection: Connection["kind"], probe: BridgeProbe | null): RunHint | null {
  const events = run.events.length;

  if (run.status === "failed") {
    return {
      tone: "danger",
      title: "The bridge broke",
      body: `${run.error ?? "The agent did not answer."} Anything after that point was never recorded, so what is below is only what had already happened.`,
    };
  }

  if (run.status === "running") {
    if (events > 0) return null;
    if (connection === "mcp") {
      return {
        tone: "warn",
        title: "Nothing has connected yet",
        body: "This agent is registered to dial in over MCP, so AgentSim is waiting to be called and will idle out if nobody does. Point the agent at the URLs below — or give it an endpoint AgentSim can call, which is the shorter path.",
      };
    }
    if (probe && !probe.reachable) {
      return { tone: "danger", title: "Your agent's endpoint is not answering", body: `${probe.detail} There is nothing for AgentSim to drive, so this Run will finish empty.` };
    }
    return { tone: "info", title: "Waiting for the first tool call", body: "AgentSim has handed your agent the Task Brief and its runId. Its tool calls appear here as it makes them." };
  }

  if (events === 0) {
    if (run.finishedBy === "idle_timeout") {
      return {
        tone: "warn",
        title: "Nothing ever connected",
        body: "The Run idled out without a single tool call. Nothing reached the Gateway, so there was nothing to grade — the score below is what an absent agent scores, not a finding about this one.",
      };
    }
    return {
      tone: "warn",
      title: "The agent answered, but never touched this World",
      body: "It replied in prose and made no tool call through this Run. That normally means it executed against its own world instead of the Run's: its tool loop has to call POST /api/runs/:id/call with the runId AgentSim sent it. Nothing reached the Gateway, so there was nothing to grade.",
    };
  }

  return null;
}
