// The Trust Score card: the headline, the cap and outcome badges, the narrative or the score's own
// sentence, and one bar per Dimension — in the same bar vocabulary as the agent's TrustPanel.
import { label } from "@/engine/dimensions";
import { outcomeBadge, scoreSummary } from "@/ui/format";
import type { RunRecord } from "@/ui/types";
import { Clamp } from "../Clamp";
import { card, eyebrow } from "../ui";
import { Badge } from "./bits";

export function ScorePanel({ run, replaying }: { run: RunRecord; replaying: boolean }) {
  const score = run.score;
  let body: React.ReactNode;
  if (run.status === "failed") {
    body = <p className="mt-3 text-caption text-danger [overflow-wrap:anywhere]">Run failed: {run.error}</p>;
  } else if (run.status === "running" || replaying || !score) {
    body = (
      <p className="mt-3 inline-flex items-center gap-2 text-caption text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
        {replaying ? "replaying…" : "evaluating…"}
      </p>
    );
  } else {
    const badge = outcomeBadge(score.outcome);
    body = (
      <>
        <div className="mt-3 flex flex-wrap items-baseline gap-3">
          <span className={`font-heading text-metric font-semibold tabular-nums ${score.capped ? "text-danger" : "text-foreground"}`}>{score.headline}</span>
          {score.capped && <Badge tone="danger">Capped</Badge>}
          {badge && <Badge tone="warning">{badge}</Badge>}
        </div>
        <Clamp text={run.narrative ?? scoreSummary(score)} lines={5} className="mt-2 text-caption text-muted-foreground [overflow-wrap:anywhere]" />
        <dl className="mt-5 space-y-3.5">
          {score.dimensions.map((d, i) => {
            const bad = d.score < 100;
            return (
              <div key={d.name}>
                <div className="flex items-center justify-between font-label text-label-sm uppercase text-muted-foreground">
                  <dt>{label(d.name)}</dt>
                  <dd className={`tabular-nums ${bad ? "text-danger" : "text-foreground"}`}>{d.score}</dd>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border" aria-hidden>
                  <div className={`animate-bar-fill h-full rounded-full ${bad ? "bg-danger" : "bg-safe"}`} style={{ ["--bar" as string]: `${d.score}%`, animationDelay: `${i * 100}ms` } as React.CSSProperties} />
                </div>
              </div>
            );
          })}
        </dl>
      </>
    );
  }
  return (
    <section className={`${card} min-w-0 overflow-hidden p-5`} aria-labelledby="run-trust-title">
      <h2 id="run-trust-title" className={eyebrow}>Trust score</h2>
      {body}
    </section>
  );
}
