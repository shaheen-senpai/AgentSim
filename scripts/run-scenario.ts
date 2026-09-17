import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { label } from "@/engine/evaluator";
import { loadPack } from "@/engine/pack";
import { startRun } from "@/runner/run";
import { agentLabel, loadRun, type RunRecord } from "@/runner/store";
import { aggregate, formatProportion } from "@/engine/aggregate";

async function main() {
  const { values } = parseArgs({
    options: {
      pack: { type: "string" },
      scenario: { type: "string" },
      attack: { type: "string" },
      agent: { type: "string", default: "naive" },
      repeat: { type: "string", default: "1" },
    },
  });
  if (!values.pack || !values.scenario) {
    console.error("usage: run-scenario --pack <id> --scenario <id> [--attack <id>] [--agent <version>] [--repeat <n>]");
    process.exit(1);
  }
  const packId = values.pack;
  const scenarioId = values.scenario;
  const agent = values.agent!;
  const attackId = values.attack ?? null;

  // Loaded once here and reused for the scenario lookup below — startRun/createRun load their own
  // instance internally (necessarily, since CreateRunOptions takes a packId), but the script itself
  // must not load it a second time (Task 7 review finding).
  const pack = loadPack(packId);
  const scenario = pack.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`Unknown scenario ${scenarioId} in pack ${packId}`);

  const repeat = Number(values.repeat);
  if (!Number.isInteger(repeat) || repeat < 1) {
    console.error(`--repeat must be a positive integer, got ${values.repeat}`);
    process.exit(1);
  }

  const results: RunRecord[] = [];
  for (let i = 0; i < repeat; i++) {
    if (repeat > 1) console.log(`\n── run ${i + 1} of ${repeat} ──`);
    results.push(await once({ packId, scenarioId, attackId, agent, title: scenario.title }, repeat === 1));
  }
  if (repeat > 1) report(results);
}

/** One Run, start to finish. `verbose` prints the full per-Event and per-Dimension breakdown. */
async function once(
  opts: { packId: string; scenarioId: string; attackId: string | null; agent: string; title: string },
  verbose: boolean,
): Promise<RunRecord> {
  const { packId, scenarioId, attackId, agent, title } = opts;
  const t0 = Date.now();
  const id = startRun({ packId, scenarioId, attackId, agent: { kind: "reference", version: agent } });
  console.log(`${id} · ${packId}/${title} · ${agent}${attackId ? ` · attack ${attackId}` : ""}`);

  // startRun kicks the Reference Agent off in the background and returns immediately; poll the
  // persisted Run (saved on every Event, and again on finish) until it's done.
  const seen = new Set<number>();
  let run = loadRun(id)!;
  while (run.status === "running") {
    await sleep(200);
    run = loadRun(id)!;
    for (const e of run.events) {
      if (seen.has(e.seq)) continue;
      seen.add(e.seq);
      if (verbose) console.log(`  #${e.seq} ${e.tool}(${JSON.stringify(e.input)})${e.isError ? `  ✗ ${e.error}` : ""}`);
    }
  }

  if (run.error) console.log(`\n✗ ${run.error}`);
  const s = run.score!;
  if (verbose) {
    console.log(`\nTrust Score ${s.headline}${s.capped ? ` · CAPPED (${s.capReason})` : ""}`);
    for (const d of s.dimensions) console.log(`  ${label(d.name).padEnd(18)} ${String(d.score).padStart(3)}  (${d.passed}/${d.total})`);
    for (const v of run.violations) console.log(`  ✗ ${v.dimension} · ${v.checkType}${v.eventSeq ? ` · #${v.eventSeq}` : ""} — ${v.message}`);
    console.log(`\n${run.events.length} tool calls · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${run.usage.inputTokens} in / ${run.usage.outputTokens} out${run.cappedOut ? " · CAPPED OUT" : ""}${run.truncated ? " · TRUNCATED" : ""}\ndata/runs/${run.id}.json`);
  } else {
    console.log(`  ${s.outcome}${s.capped ? " · CAPPED" : ""} · headline ${s.headline} · ${run.events.length} calls · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  return run;
}

/**
 * The batch read as a sample. One Run is one draw, so a bare rate over a handful of Runs is not a
 * measurement — every rate here carries its interval. `npm run aggregate` gives the same view over
 * every Run on disk, including earlier batches.
 */
function report(results: RunRecord[]): void {
  // Labelled exactly as `npm run aggregate` will label the same Runs once they are on disk.
  const [group] = aggregate(results.map((r) => ({ ...r, agentLabel: agentLabel(r.agent), attackId: r.attack?.id ?? null })));
  if (!group) return;
  const line = (name: string, p: Parameters<typeof formatProportion>[0]) => `  ${name.padEnd(11)} ${formatProportion(p)}`;

  console.log(`\n── ${group.runs} runs${group.headline ? ` · headline ${group.headline.mean} mean (${group.headline.min}–${group.headline.max})` : ""} ──`);
  console.log(line("passed", group.passed));
  console.log(line("capped", group.capped));
  if (group.lureTaken) console.log(line("lure taken", group.lureTaken));
  console.log(`  outcomes    ${Object.entries(group.outcomes).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
  const span = group.passed.high - group.passed.low;
  if (span > 0.4) console.log(`  ⚠ ${group.runs} runs is still too few to call this rate — the interval spans ${Math.round(span * 100)}%.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
