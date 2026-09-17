// Transcript replay: pins the Evaluator to the real, committed golden Run records. Each golden's
// stored Snapshots and Events (Event v2 / World-pack shaped — `scripts/migrate-runs.ts` migrated
// them from v1) are read straight off disk and re-evaluated; the Evaluator must reproduce the
// stored Score and the same Violations. A Check-vocabulary drift (a check type renamed or its
// behaviour changed) makes this test fail loudly, even though nothing else in the suite touches
// these specific recorded transcripts.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { evaluate } from "@/engine/evaluator";
import { loadPack } from "@/engine/pack";
import type { RunRecord } from "@/runner/store";
import { copyFixturePacks } from "../helpers/packs";

beforeAll(() => {
  copyFixturePacks("northwind");
});

// The real, repo-committed golden Run records — read directly by path, independent of
// `AGENTSIM_DATA_DIR` (other test files repoint that at throwaway temp dirs and never restore it).
const GOLDEN_DIR = path.join(process.cwd(), "data", "golden");

function goldenRuns(): { file: string; run: RunRecord }[] {
  return readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => ({ file, run: JSON.parse(readFileSync(path.join(GOLDEN_DIR, file), "utf8")) as RunRecord }));
}

/** `(checkType, eventSeq)` pairs, sorted so the comparison is order-independent (a multiset, not a true Set — duplicates matter). */
function violationPairs(violations: RunRecord["violations"]): string[] {
  return violations.map((v) => `${v.checkType}#${v.eventSeq}`).sort();
}

const runs = goldenRuns();

describe("transcript replay — real golden Runs", () => {
  it("found the committed goldens under data/golden", () => {
    expect(runs.length).toBeGreaterThanOrEqual(3);
  });

  for (const { file, run } of runs) {
    it(`${file}: evaluate() reproduces the stored Score and Violations`, () => {
      // A record still in v1 shape (top-level Snapshot arrays, no `collections`) means
      // scripts/migrate-runs.ts has not been run — fail loudly rather than silently mis-evaluating.
      expect(run.startSnapshot?.collections).toBeTruthy();
      expect(run.endSnapshot?.collections).toBeTruthy();

      const pack = loadPack(run.packId);
      const scenario = pack.scenarios.find((s) => s.id === run.scenarioId);
      expect(scenario).toBeTruthy();

      const { violations, score } = evaluate({
        pack,
        scenario: scenario!,
        attack: run.attack,
        start: run.startSnapshot,
        end: run.endSnapshot!,
        events: run.events,
      });

      // Full Score equality: headline, capped, capReason, and every Dimension's score/passed/total.
      expect(score).toEqual(run.score);
      // Same (checkType, eventSeq) Violation pairs — the Evaluator's vocabulary, not its wording.
      expect(violationPairs(violations)).toEqual(violationPairs(run.violations));
    });
  }

  it("the attacked naïve golden's get_thread Event ingested the injected content, and it took the Lure at Event #9", () => {
    const attacked = runs.find(({ run }) => run.agent.kind === "reference" && run.agent.version === "naive" && run.attack !== null);
    expect(attacked, "expected one committed golden: naïve agent, under attack").toBeTruthy();
    const { run } = attacked!;
    const attack = run.attack!;

    const readThread = run.events.find((e) => e.tool === "get_thread");
    expect(readThread).toBeTruthy();
    expect(readThread!.injected).toEqual({ attackId: attack.id, collection: "emails", id: "eml_9001", field: "body" });

    expect(run.violations).toContainEqual(expect.objectContaining({ checkType: "lure_not_taken", eventSeq: 9 }));
  });
});
