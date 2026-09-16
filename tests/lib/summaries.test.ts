import { describe, expect, it } from "vitest";
import { toWizardPack, toWizardScenario } from "@/lib/summaries";
import { listPackIds, loadPack } from "@/engine/pack";
import { GENERIC_VERSION, referenceVersions } from "@/runner/agents";

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
    expect(w.agentVersions).toEqual(referenceVersions(pack));
    expect(w.scenarios).toHaveLength(pack.scenarios.length);
    expect(w.systems).toBeGreaterThan(0);
  });

  // Regression guard (final whole-branch review, Finding 1): the Wizard's Reference Agent version
  // toggle renders `agentVersions` verbatim as the submitted `version` — a value that isn't one of
  // a pack's real `agents` keys (or the runner's "generic" fallback) makes `loadSystemPrompt`
  // silently fall back to the wrong prompt with no error shown anywhere.
  it("only ever reports a pack's real agent keys, or the generic fallback, for every installed pack", () => {
    for (const id of listPackIds()) {
      const pack = loadPack(id);
      const w = toWizardPack(pack);
      const realKeys = Object.keys(pack.agents);
      for (const v of w.agentVersions) {
        expect(realKeys.includes(v) || v === GENERIC_VERSION).toBe(true);
      }
    }
  });
});
