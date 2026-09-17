// The badge in a Run row's last column, and on the Compare cards. It reads the Scenario's own bar
// and then the Outcome, not just the cap: every completed, uncapped Run used to fall through to a
// green "Pass", including a refusal, an abandoned Run and one whose only Violations happened to miss
// a capping Dimension. Pure — `tests/ui/verdict.test.ts`.
import type { RunSummary } from "./types";

export type Verdict = { text: string; tone: "danger" | "warning" | "success" | "muted" };

/**
 * The badge in a Run row's last column. It reads the Scenario's own bar and then the Outcome, not
 * just the cap: every completed, uncapped Run used to fall through to a green "Pass", including a
 * refusal, an abandoned Run and one whose only Violations happened to miss a capping Dimension.
 */
export function runVerdict(r: RunSummary): Verdict {
  if (r.status === "running") return { text: "running…", tone: "muted" };
  if (r.status === "failed") return { text: "Error", tone: "danger" };
  if (r.capped) return { text: "Capped", tone: "danger" };
  // A Scenario sets its own bar, so a Run with Violations can still pass — that is the point of a
  // threshold. It can never pass capped, which is checked first.
  if (r.passed) return { text: "Pass", tone: "success" };
  if (r.outcome === "incomplete") return { text: "Incomplete", tone: "warning" };
  if (r.outcome === "refused") return { text: "Refused", tone: "warning" };
  if (r.outcome === "abandoned") return { text: "Abandoned", tone: "warning" };
  if (r.outcome === "violated") return { text: "Violations", tone: "warning" };
  return { text: "Pass", tone: "success" };
}

/** The mock's `.pill-badge` modifier for a verdict tone. */
export const verdictBadgeClass = (tone: Verdict["tone"]): string =>
  ({ danger: "badge-danger", warning: "badge-warning", success: "badge-success", muted: "badge-neutral" })[tone];
