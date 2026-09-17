import { describe, expect, it } from "vitest";
import type { Agent, RunAgentRef } from "@/ui/types";
import { connectionOf, runConnection, runHint } from "@/workspace/run/bridge";

const agent = (over: Partial<Agent>): Pick<Agent, "shape" | "url"> => ({ shape: "mcp", url: "", ...over });
const byo = (shape: "mcp" | "driven"): RunAgentRef => ({ kind: "byo", agentId: "agt_a", name: "A", shape, toolAliases: {} });
const run = (over: Partial<Parameters<typeof runHint>[0]> = {}) => ({ status: "running" as const, error: null, events: [], finishedBy: null, ...over });
const calls = (n: number) => Array.from({ length: n }, (_, i) => ({ seq: i + 1 }));

describe("connectionOf", () => {
  it("is a bridge only when the agent is driven AND has somewhere to be called", () => {
    expect(connectionOf(agent({ shape: "driven", url: "http://127.0.0.1:4100/" }))).toEqual({ kind: "bridge", url: "http://127.0.0.1:4100/" });
    expect(connectionOf(agent({ shape: "driven", url: "   " })).kind).toBe("mcp");
    expect(connectionOf(agent({ shape: "mcp", url: "http://x" })).kind).toBe("mcp");
  });

  it("reads the same way off a Run's copy of its agent", () => {
    expect(runConnection(byo("driven"))).toBe("bridge");
    expect(runConnection(byo("mcp"))).toBe("mcp");
    expect(runConnection({ kind: "reference", version: "naive", model: "m" })).toBe("mcp");
  });
});

describe("runHint", () => {
  it("says nothing once calls are arriving, or once a finished Run has some", () => {
    expect(runHint(run({ events: calls(3) }), "bridge", { reachable: true, detail: "" })).toBeNull();
    expect(runHint(run({ status: "completed", events: calls(3) }), "bridge", null)).toBeNull();
  });

  it("leads with the failure when the Run failed, whatever else is true", () => {
    const hint = runHint(run({ status: "failed", error: "The agent returned 500: fetch failed", events: calls(2) }), "bridge", { reachable: true, detail: "" });
    expect(hint?.tone).toBe("danger");
    expect(hint?.body).toContain("fetch failed");
  });

  it("distinguishes a dead endpoint from one that simply has not called yet", () => {
    expect(runHint(run(), "bridge", { reachable: false, detail: "nothing there." })?.tone).toBe("danger");
    expect(runHint(run(), "bridge", { reachable: true, detail: "" })?.tone).toBe("info");
    expect(runHint(run(), "bridge", null)?.tone).toBe("info");
  });

  it("tells an MCP Run that it is waiting to be dialled, not working", () => {
    const hint = runHint(run(), "mcp", null);
    expect(hint?.tone).toBe("warn");
    expect(hint?.title).toMatch(/connected/i);
  });

  it("separates 'nobody connected' from 'answered but never touched the World'", () => {
    const idled = runHint(run({ status: "completed", finishedBy: "idle_timeout" }), "mcp", null);
    expect(idled?.title).toMatch(/Nothing ever connected/);

    const talked = runHint(run({ status: "completed", finishedBy: "agent" }), "bridge", { reachable: true, detail: "" });
    expect(talked?.tone).toBe("warn");
    expect(talked?.body).toContain("/api/runs/:id/call");
  });
});
