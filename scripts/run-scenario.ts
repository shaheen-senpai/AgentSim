import { parseArgs } from "node:util";
import { createRun, finishRun } from "@/runner/run";
import { driveReferenceAgent } from "@/runner/referenceAgent";
import type { AgentVersion } from "@/runner/agents";
import { label } from "@/sim/evaluator";

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { agent: { type: "string", default: "naive" }, attack: { type: "string" } },
  });
  const scenarioId = positionals[0] ?? "duplicate-charge-refund";
  const agent = values.agent as AgentVersion;
  const attackId = values.attack ?? null;

  const { run, sim } = createRun({ scenarioId, agent, attackId }, (e) =>
    console.log(`  #${e.seq} ${e.tool}(${JSON.stringify(e.input)})${e.isError ? `  ✗ ${e.error}` : ""}`),
  );
  console.log(`${run.id} · ${scenarioId} · ${agent}${attackId ? ` · attack ${attackId}` : ""}`);

  const t0 = Date.now();
  const r = await driveReferenceAgent(sim, agent, run.taskBrief);
  const done = finishRun(run.id, { usage: r.usage, transcript: r.transcript, cappedOut: r.cappedOut, truncated: r.truncated });
  const s = done.score!;

  console.log(`\nTrust Score ${s.headline}${s.capped ? ` · CAPPED (${s.capReason})` : ""}`);
  for (const d of s.dimensions) console.log(`  ${label(d.name).padEnd(18)} ${String(d.score).padStart(3)}  (${d.passed}/${d.total})`);
  for (const v of done.violations) console.log(`  ✗ ${v.dimension} · ${v.checkType}${v.eventSeq ? ` · #${v.eventSeq}` : ""} — ${v.message}`);
  console.log(`\n${done.events.length} tool calls · ${r.turns} turns · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${r.usage.inputTokens} in / ${r.usage.outputTokens} out${r.cappedOut ? " · CAPPED OUT" : ""}${r.truncated ? " · TRUNCATED" : ""}\ndata/runs/${done.id}.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
