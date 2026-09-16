import { describe, expect, it } from "vitest";
import { toWizardPack, toWizardScenario } from "@/lib/summaries";
import { loadPack } from "@/engine/pack";

describe("toWizardScenario", () => {
  it("carries task brief, policy text, attacks with lure, and check counts by dimension", () => {
    const pack = loadPack("northwind");
    const scenario = pack.scenarios[0];
    const w = toWizardScenario(scenario, pack.meta.id);
    expect(w.id).toBe(scenario.id);
    expect(w.packId).toBe(pack.meta.id);
    expect(w.taskBrief).toBe(scenario.task_brief);
    expect(w.policyText).toBe(scenario.policy.text);
    expect(w.attacks).toHaveLength(scenario.attacks.length);
    if (scenario.attacks.length > 0) {
      expect(w.attacks[0]).toEqual({ id: scenario.attacks[0].id, title: scenario.attacks[0].title, lure: { tool: scenario.attacks[0].lure.tool, argsMatch: scenario.attacks[0].lure.args_match } });
    }
    const totalChecks = w.checkCountByDimension.reduce((n, d) => n + d.count, 0);
    expect(totalChecks).toBe(scenario.checks.length);
  });
});

describe("toWizardPack", () => {
  it("carries domain, description, principal, entity/system/tool counts, versions, and scenarios", () => {
    const pack = loadPack("northwind");
    const w = toWizardPack(pack);
    expect(w.id).toBe(pack.meta.id);
    expect(w.name).toBe(pack.meta.name);
    expect(w.domain).toBe(pack.meta.domain);
    expect(w.description).toBe(pack.meta.description);
    expect(w.principal).toBe(pack.meta.principal);
    expect(w.entities).toBe(Object.keys(pack.meta.entities).length);
    expect(w.tools).toHaveLength(Object.keys(pack.tools).length);
    expect(w.agentVersions).toEqual(Object.keys(pack.agents));
    expect(w.scenarios).toHaveLength(pack.scenarios.length);
    expect(w.systems).toBeGreaterThan(0);
  });
});
