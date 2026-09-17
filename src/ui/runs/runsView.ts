// The Runs page's view model: what each row shows, the sentence under the title, and the three
// insight cards — all derived from `RunSummary`, never from a pack. Pure; `tests/ui/runsView.test.ts`.
import { DIMENSIONS, label as dimensionLabel } from "@/engine/dimensions";
import { latestComparablePair } from "@/ui/compare/latestComparablePair";
import { firstSentence, runName, scenarioShortTitle } from "@/ui/format";
import { relativeTime } from "@/ui/relativeTime";
import type { RunSummary } from "@/ui/types";
import { runVerdict, type Verdict } from "@/ui/verdict";

export type RunRow = {
  id: string;
  name: string;
  scenarioShort: string;
  packName: string;
  agentLabel: string;
  attackId: string | null;
  status: RunSummary["status"];
  headline: number | null;
  capped: boolean;
  verdict: Verdict;
  dims: { label: string; score: number }[];
  when: string;
};

const plural = (n: number, word: string, pluralWord = `${word}s`): string => `${n} ${n === 1 ? word : pluralWord}`;

export function toRunRow(s: RunSummary, now: number): RunRow {
  return {
    id: s.id,
    name: runName(s.agentLabel, s.attackId),
    scenarioShort: scenarioShortTitle(s.scenarioTitle),
    packName: s.packName,
    agentLabel: s.agentLabel,
    attackId: s.attackId,
    status: s.status,
    headline: s.headline,
    capped: s.capped,
    verdict: runVerdict(s),
    // Canonical order and always five: a still-running Run has no score yet and draws a full strip.
    dims: DIMENSIONS.map((name) => ({ label: dimensionLabel(name), score: s.dimensions.find((d) => d.name === name)?.score ?? 100 })),
    when: relativeTime(s.createdAt, now),
  };
}

/** "6 runs across 2 Worlds. 2 failed their Mandate — every one of them under Attack." */
export function runsSubline(runs: RunSummary[]): string {
  if (runs.length === 0) return "No runs yet.";
  const worlds = new Set(runs.map((r) => r.packId)).size;
  const capped = runs.filter((r) => r.capped);
  const head = `${plural(runs.length, "run")} across ${plural(worlds, "World")}.`;
  if (capped.length === 0) return `${head} None failed their Mandate.`;
  const attacked = capped.filter((r) => r.attackId !== null).length;
  if (capped.length === 1) return `${head} 1 failed its Mandate — ${attacked === 1 ? "" : "not "}under Attack.`;
  const tail = attacked === capped.length ? "every one of them under Attack." : attacked === 0 ? "none under Attack." : `${attacked} of them under Attack.`;
  return `${head} ${capped.length} failed their Mandate — ${tail}`;
}

export type Insight = { title: string; detail: string; href?: string; tone: "warning" | "success" | "danger"; icon: string };

/** The mock's "Compare naïve vs. fixed →" card, over the real latest comparable pair. */
export function compareInsight(runs: RunSummary[]): Insight | null {
  const pair = latestComparablePair(runs);
  if (!pair) return null;
  const { a, b } = pair;
  return {
    title: `Compare ${a.agentLabel} vs. ${b.agentLabel}`,
    detail: `${scenarioShortTitle(a.scenarioTitle)}: same Scenario, ${a.headline ?? "—"} → ${b.headline ?? "—"}. Opens the Compare page.`,
    href: `/compare?a=${encodeURIComponent(a.id)}&b=${encodeURIComponent(b.id)}`,
    tone: "warning",
    icon: "⇄",
  };
}

/** How many attacked Runs performed the Lure. Null when nothing has been attacked yet. */
export function luresInsight(runs: RunSummary[]): Insight | null {
  const attacked = runs.filter((r) => r.attackId !== null);
  if (attacked.length === 0) return null;
  const taken = attacked.filter((r) => r.lureTaken).length;
  return {
    title: plural(taken, "Lure taken", "Lures taken"),
    detail: `${taken} of ${plural(attacked.length, "attacked run")} took the bait.`,
    tone: taken > 0 ? "danger" : "success",
    icon: "⚠",
  };
}

/** The first sentence of the most recent Run's Policy — what every Check traces back to. */
export function mandateInsight(policyText: string | null): Insight | null {
  if (!policyText) return null;
  return { title: "Mandate in force", detail: firstSentence(policyText), tone: "success", icon: "✓" };
}
