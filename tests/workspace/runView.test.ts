import { describe, expect, it } from "vitest";
import type { RunRecord } from "@/ui/types";
import { eventCountLabel, runNav, runStatusTag } from "@/workspace/run/runView";

const byo = (agentId: string | null): RunRecord["agent"] => ({ kind: "byo", agentId, name: "Loop Agent", shape: "forwarder", toolAliases: {} });
const reference: RunRecord["agent"] = { kind: "reference", version: "naive", model: "claude-haiku-4-5" };
const run = (agent: RunRecord["agent"]) => ({ scenarioTitle: "Duplicate charge → refund the extra payment", agent });

describe("runNav", () => {
  it("walks back to the agent when the Run belongs to a registered agent", () => {
    const nav = runNav(run(byo("agt_1")), { id: "agt_1", name: "Loop Agent" });
    expect(nav.backHref).toBe("/agents/agt_1");
    expect(nav.backLabel).toBe("Loop Agent");
    expect(nav.crumbs).toEqual([
      { label: "Agents", href: "/agents" },
      { label: "Loop Agent", href: "/agents/agt_1" },
      { label: "Duplicate charge → refund the extra payment" },
    ]);
  });

  it("falls back to the Runs list for a Reference Run, or a BYO Run whose agent is gone", () => {
    for (const r of [run(reference), run(byo(null)), run(byo("agt_deleted"))]) {
      const nav = runNav(r, null);
      expect(nav.backHref).toBe("/runs");
      expect(nav.backLabel).toBe("All runs");
      expect(nav.crumbs).toEqual([{ label: "Runs", href: "/runs" }, { label: r.scenarioTitle }]);
    }
  });
});

describe("runStatusTag", () => {
  it("names the status and its tone", () => {
    expect(runStatusTag("running")).toEqual({ text: "Running", tone: "muted" });
    expect(runStatusTag("completed")).toEqual({ text: "Completed", tone: "safe" });
    expect(runStatusTag("failed")).toEqual({ text: "Failed", tone: "danger" });
  });
});

describe("eventCountLabel", () => {
  it("pluralises and marks a live Run", () => {
    expect(eventCountLabel(0, false)).toBe("0 events");
    expect(eventCountLabel(1, false)).toBe("1 event");
    expect(eventCountLabel(7, true)).toBe("7 events · running");
  });
});
