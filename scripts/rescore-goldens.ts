// Re-evaluates every committed golden Run in place — for when the Score shape grows a field and
// `tests/runner/replay.test.ts` (which asserts full Score equality) would otherwise fail.
//
// Usage: npx tsx scripts/rescore-goldens.ts [--dry-run]
//
// This script only ever ADDS to a Score. A golden whose headline, cap or Dimension numbers would
// move, or whose Violations would change, is left untouched and the script exits non-zero: that is
// a real scoring change and wants a human, not a rewrite.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { evaluate } from "@/engine/evaluator";
import { loadPack } from "@/engine/pack";
import type { RunRecord } from "@/runner/store";

const dryRun = process.argv.includes("--dry-run");
const dir = path.join(process.cwd(), "data", "golden");
const pairs = (vs: RunRecord["violations"]) => vs.map((v) => `${v.checkType}#${v.eventSeq}`).sort().join(",");

let changed = 0;
let failed = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const full = path.join(dir, file);
  const run = JSON.parse(readFileSync(full, "utf8")) as RunRecord;
  const pack = loadPack(run.packId);
  const scenario = pack.scenarios.find((s) => s.id === run.scenarioId);
  if (!scenario || !run.endSnapshot || !run.score) {
    console.error(`✗ ${file}: not a scored, migrated Run record`);
    failed += 1;
    continue;
  }

  const { violations, score } = evaluate({
    pack,
    scenario,
    attack: run.attack,
    start: run.startSnapshot,
    end: run.endSnapshot,
    events: run.events,
    errored: run.status === "failed" || run.finishedBy === "idle_timeout",
  });

  const before = { headline: run.score.headline, capped: run.score.capped, capReason: run.score.capReason, dimensions: run.score.dimensions };
  const after = { headline: score.headline, capped: score.capped, capReason: score.capReason, dimensions: score.dimensions };
  if (JSON.stringify(before) !== JSON.stringify(after) || pairs(run.violations) !== pairs(violations)) {
    console.error(`✗ ${file}: the score itself moved — ${JSON.stringify(before)} → ${JSON.stringify(after)}. Left untouched.`);
    failed += 1;
    continue;
  }

  if (JSON.stringify(run.score) === JSON.stringify(score)) {
    console.log(`· ${file}: already current`);
    continue;
  }
  // Same serialization as `saveRun` (no indent, no trailing newline), so the diff is one changed line.
  if (!dryRun) writeFileSync(full, JSON.stringify({ ...run, score }));
  console.log(`${dryRun ? "would update" : "✓ updated"} ${file}: headline ${score.headline}, outcome ${score.outcome}`);
  changed += 1;
}

console.log(`\n${changed} golden${changed === 1 ? "" : "s"} ${dryRun ? "would be " : ""}updated, ${failed} refused`);
process.exit(failed > 0 ? 1 : 0);
