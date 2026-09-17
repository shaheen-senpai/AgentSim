// Reads the stored Runs as samples rather than as verdicts.
//
// Usage: npm run aggregate [-- --scenario <id>]
//
// One Run is one draw. This groups the Runs on disk by pack, Scenario, agent and Attack, and
// prints each group's rates with a 95% interval, so a rate over five Runs cannot be mistaken for a
// measurement. Where two agents have been run against the same Scenario and Attack, it also says
// whether their Lure rates are actually distinguishable at the sample sizes recorded.
import { parseArgs } from "node:util";
import { aggregate, formatProportion, separated, type RunGroup } from "@/engine/aggregate";
import { agentLabel, listRuns, loadRun, type RunRecord } from "@/runner/store";

const { values } = parseArgs({ options: { scenario: { type: "string" } } });

// Golden Runs are curated demo records kept on purpose, not draws from the population these
// intervals describe. Folding them in would put a hand-picked example inside the sample.
const runs = listRuns(values.scenario)
  .filter((s) => !s.golden)
  .map((s) => loadRun(s.id))
  .filter((r): r is RunRecord => r !== null)
  .map((r) => ({ ...r, agentLabel: agentLabel(r.agent), attackId: r.attack?.id ?? null }));

const groups = aggregate(runs);
if (groups.length === 0) {
  console.log(values.scenario ? `No finished Runs for scenario ${values.scenario}.` : "No finished Runs yet — try npm run run:scenario -- --repeat 10.");
  process.exit(0);
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const line = (label: string, p: Parameters<typeof formatProportion>[0]) => `  ${label.padEnd(11)} ${formatProportion(p)}`;

for (const g of groups) {
  const h = g.headline;
  console.log(`\n${g.packId}/${g.scenarioId} · ${g.agentLabel} · ${g.attackId ?? "no attack"}`);
  console.log(`  ${g.runs} run${g.runs === 1 ? "" : "s"}${h ? ` · headline ${h.mean} mean (${h.min}–${h.max})` : ""}`);
  console.log(line("passed", g.passed));
  console.log(line("capped", g.capped));
  if (g.lureTaken) console.log(line("lure taken", g.lureTaken));
  const seen = Object.entries(g.outcomes).filter(([, n]) => n > 0).map(([name, n]) => `${name} ${n}`);
  console.log(`  outcomes    ${seen.join(" · ")}`);
  // The interval is the whole point: say plainly when it is too wide to conclude anything.
  if (g.passed.high - g.passed.low > 0.4) console.log(`  ⚠ ${g.runs} run${g.runs === 1 ? "" : "s"} is too few to call this rate — the interval spans ${pct(g.passed.high - g.passed.low)}.`);
}

// Two agents, same Scenario and Attack: is the difference between them real?
const byScenarioAttack = new Map<string, RunGroup[]>();
for (const g of groups.filter((g) => g.lureTaken)) {
  const k = `${g.packId}/${g.scenarioId}/${g.attackId}`;
  byScenarioAttack.set(k, [...(byScenarioAttack.get(k) ?? []), g]);
}
for (const [k, gs] of byScenarioAttack) {
  for (let i = 0; i < gs.length; i++) {
    for (let j = i + 1; j < gs.length; j++) {
      const [a, b] = [gs[i], gs[j]];
      const verdict = separated(a.lureTaken!, b.lureTaken!)
        ? "a real difference at these sample sizes"
        : "NOT distinguishable at these sample sizes — the intervals overlap";
      console.log(`\n${k}\n  ${a.agentLabel} ${a.lureTaken!.count}/${a.lureTaken!.total} vs ${b.agentLabel} ${b.lureTaken!.count}/${b.lureTaken!.total}: ${verdict}.`);
    }
  }
}
console.log();
