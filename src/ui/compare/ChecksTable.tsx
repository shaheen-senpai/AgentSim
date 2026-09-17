// Checks grouped by Dimension, pass/fail per Run (design/agentsim-console.html 1197-1216). The
// Dimension header row also carries each Run's score for that Dimension, as the mock does.
import type { Dimension } from "@/engine/dimensions";
import type { Violation, Score } from "@/engine/evaluator";
import type { Check } from "@/engine/pack";
import type { Lure } from "@/engine/pack";
import { checkParams, lureSummary } from "@/ui/worlds/packView";

/** `lure_not_taken` is synthesised (never authored), so its params are an Attack id and a Lure. */
function params(check: Check): string {
  if ((check as { type: string }).type !== "lure_not_taken") return checkParams(check);
  const { attack, lure } = check as unknown as { attack: string; lure: Lure };
  return `attack: ${attack} · lure: ${lureSummary(lure)}`;
}
import { checkOutcomes, groupOutcomesByDimension } from "./compareLedger";

function dimScore(score: Score | null, d: Dimension): number | null {
  return score?.dimensions.find((x) => x.name === d)?.score ?? null;
}

function Mark({ pass }: { pass: boolean }) {
  return <span className={`vv ${pass ? "pass" : "fail"}`}>{pass ? "✓" : "✗"}</span>;
}

export function ChecksTable({ checks, violationsA, violationsB, scoreA, scoreB }: { checks: Check[]; violationsA: Violation[]; violationsB: Violation[]; scoreA: Score | null; scoreB: Score | null }) {
  const groups = groupOutcomesByDimension(checkOutcomes(checks, violationsA, violationsB));
  if (groups.length === 0) return null;

  return (
    <section className="panel" style={{ overflow: "hidden", marginBottom: 16 }}>
      <h2 style={{ margin: 0, padding: "16px 16px 4px", fontSize: 14 }}>Checks — {checks.length}, every one traced to the Mandate</h2>
      <p style={{ margin: 0, padding: "0 16px 10px", fontSize: 11.5, color: "var(--muted)" }}>Grouped by the Dimension they score. A failed Check is what moves its Dimension.</p>
      <div className="checkrow head">
        <span>Check</span>
        <span className="vv">A</span>
        <span className="vv">B</span>
      </div>
      {groups.map((g) => {
        const av = dimScore(scoreA, g.dimension), bv = dimScore(scoreB, g.dimension);
        return (
          <div key={g.dimension}>
            <div className="dimhead">
              <span>{g.label}</span>
              <span className={`vv mono${av !== null && av < 100 ? " num-bad" : ""}`}>{av ?? "—"}</span>
              <span className={`vv mono${bv !== null && bv < 100 ? " num-bad" : ""}`}>{bv ?? "—"}</span>
            </div>
            {g.outcomes.map((o, i) => (
              <div key={`${g.dimension}-${i}`} className="checkrow">
                <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  <span className="ctype">{o.check.type}</span> <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>{params(o.check)}</span>
                </span>
                <Mark pass={o.passA} />
                <Mark pass={o.passB} />
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}
