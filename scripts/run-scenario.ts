import { parseArgs } from "node:util";
import { label } from "@/engine/evaluator";
import { loadPack } from "@/engine/pack";
import { createRun, finishRun } from "@/runner/run";
import { driveReferenceAgent } from "@/runner/referenceAgent";

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { pack: { type: "string", default: "northwind" }, agent: { type: "string", default: "naive" }, attack: { type: "string" } },
  });
  const packId = values.pack!;
  const scenarioId = positionals[0] ?? "duplicate-charge-refund";
  const agent = values.agent!;
  const attackId = values.attack ?? null;

  const { run, gateway } = createRun({ packId, scenarioId, agent: { kind: "reference", version: agent }, attackId }, (e) =>
    console.log(`  #${e.seq} ${e.tool}(${JSON.stringify(e.input)})${e.isError ? `  ✗ ${e.error}` : ""}`),
  );
  console.log(`${run.id} · ${packId}/${scenarioId} · ${agent}${attackId ? ` · attack ${attackId}` : ""}`);

  const t0 = Date.now();
  const r = await driveReferenceAgent(gateway, loadPack(packId), agent, run.taskBrief);
  const done = finishRun(run.id, { usage: r.usage, transcript: r.transcript, cappedOut: r.cappedOut, truncated: r.truncated, finishedBy: "agent" });
  const s = done.score!;

  console.log(`\nTrust Score ${s.headline}${s.capped ? ` · CAPPED (${s.capReason})` : ""}`);
  for (const d of s.dimensions) console.log(`  ${label(d.name).padEnd(18)} ${String(d.score).padStart(3)}  (${d.passed}/${d.total})`);
  for (const v of done.violations) console.log(`  ✗ ${v.dimension} · ${v.checkType}${v.eventSeq ? ` · #${v.eventSeq}` : ""} — ${v.message}`);
  console.log(`\n${done.events.length} tool calls · ${r.turns} turns · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${r.usage.inputTokens} in / ${r.usage.outputTokens} out${r.cappedOut ? " · CAPPED OUT" : ""}${r.truncated ? " · TRUNCATED" : ""}\ndata/runs/${done.id}.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
