import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { label } from "@/engine/evaluator";
import { loadPack } from "@/engine/pack";
import { startRun } from "@/runner/run";
import { loadRun } from "@/runner/store";

async function main() {
  const { values } = parseArgs({
    options: {
      pack: { type: "string" },
      scenario: { type: "string" },
      attack: { type: "string" },
      agent: { type: "string", default: "naive" },
    },
  });
  if (!values.pack || !values.scenario) {
    console.error("usage: run-scenario --pack <id> --scenario <id> [--attack <id>] [--agent <version>]");
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

  const t0 = Date.now();
  const id = startRun({ packId, scenarioId, attackId, agent: { kind: "reference", version: agent } });
  console.log(`${id} · ${packId}/${scenario.title} · ${agent}${attackId ? ` · attack ${attackId}` : ""}`);

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
      console.log(`  #${e.seq} ${e.tool}(${JSON.stringify(e.input)})${e.isError ? `  ✗ ${e.error}` : ""}`);
    }
  }

  if (run.error) console.log(`\n✗ ${run.error}`);
  const s = run.score!;
  console.log(`\nTrust Score ${s.headline}${s.capped ? ` · CAPPED (${s.capReason})` : ""}`);
  for (const d of s.dimensions) console.log(`  ${label(d.name).padEnd(18)} ${String(d.score).padStart(3)}  (${d.passed}/${d.total})`);
  for (const v of run.violations) console.log(`  ✗ ${v.dimension} · ${v.checkType}${v.eventSeq ? ` · #${v.eventSeq}` : ""} — ${v.message}`);
  console.log(`\n${run.events.length} tool calls · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${run.usage.inputTokens} in / ${run.usage.outputTokens} out${run.cappedOut ? " · CAPPED OUT" : ""}${run.truncated ? " · TRUNCATED" : ""}\ndata/runs/${run.id}.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
