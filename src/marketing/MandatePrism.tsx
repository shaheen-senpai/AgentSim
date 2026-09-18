"use client";
// The hero's animated diagram: the agent's reads and writes flow in from the left, pass through
// the Gateway, and come out as the five Dimensions. It runs by itself — the injected email reaches
// the Gateway, the Lure is taken and the verdict flips red (Task Completion holds; Correctness,
// Policy Compliance and Safety fall; the cap makes it 40), then the clean Run scores 100 and the
// cycle restarts. The whole product in one loop.
import type { CSSProperties } from "react";
import { HERO } from "./content";
import { Icon } from "./icons";
import { PACKETS, PHASE_STATUS, prismScores, type PrismPhase } from "./prismModel";

export function MandatePrism({ phase, progress }: { phase: PrismPhase; progress: number }) {
  const poisoned = phase === "detected";
  const scores = prismScores(poisoned);
  const tone = scores.tone;
  const toneText = tone === "danger" ? "text-danger" : "text-safe";
  const toneBg = tone === "danger" ? "bg-danger" : "bg-primary";
  const statusColor = phase === "scanning" ? "text-muted-foreground" : toneText;

  return (
    <figure
      className="relative mx-auto w-full max-w-[620px] overflow-hidden border-y border-border bg-surface/35 px-4 py-8 sm:px-8"
      aria-label={`Run diagram: ${PHASE_STATUS[phase]}, Trust Score ${scores.trust}`}
    >
      <div className="prism-field absolute inset-0 opacity-70" aria-hidden />

      <div className="relative flex items-center justify-between font-label text-label uppercase text-muted-foreground">
        <span>{HERO.prism.title}</span>
        <span className={`flex items-center gap-2 transition-colors duration-500 ${statusColor}`} aria-live="polite">
          {phase === "scanning" && <span className="animate-radar-pulse size-1.5 rounded-full bg-primary" aria-hidden />}
          {PHASE_STATUS[phase]}
        </span>
      </div>

      <div className="relative mt-10 grid grid-cols-[1fr_110px_1.15fr] items-center gap-2 sm:grid-cols-[1fr_150px_1.2fr]">
        {/* Records flowing in */}
        <ul className="relative h-52 overflow-hidden" aria-label="Tool calls during the Run">
          {PACKETS.map((p, i) => {
            const hot = poisoned && p.danger;
            return (
              <li
                key={p.id}
                className={`animate-prism-packet absolute right-1 flex items-center gap-2 rounded-control border bg-background/90 px-2.5 py-2 font-label text-label-sm transition-colors duration-500 sm:text-label ${hot ? "border-danger/60 text-danger" : "border-border text-muted-foreground"}`}
                style={{ top: `${i * 25}%`, animationDelay: `${i * 0.7}s` }}
              >
                <span className={`size-1.5 rounded-full transition-colors duration-500 ${hot ? "bg-danger" : "bg-primary"}`} aria-hidden />
                <span>{p.verb} · {p.detail}</span>
              </li>
            );
          })}
        </ul>

        {/* The prism core */}
        <div className="relative grid h-52 place-items-center">
          <div
            className={`prism-core animate-core-breathe relative grid size-28 place-items-center border bg-background/90 sm:size-36 ${poisoned ? "border-danger/60" : "border-primary/60"}`}
            style={{ ["--core-glow" as string]: poisoned ? "var(--color-danger)" : "var(--color-signal)" } as CSSProperties}
          >
            <div className="absolute inset-3 border border-primary/20" aria-hidden />
            <Icon name="diamond" className={`relative z-10 size-8 transition-colors duration-500 ${toneText}`} />
            <span className="absolute bottom-6 font-label text-label-sm uppercase text-muted-foreground sm:bottom-8">{HERO.prism.core}</span>
          </div>
          <span className={`animate-prism-scan absolute h-px w-28 transition-colors duration-500 sm:w-36 ${toneBg}`} aria-hidden />
        </div>

        {/* Scores coming out */}
        <dl className="space-y-3">
          {scores.dimensions.map((d, i) => {
            const bad = d.tone === "danger";
            return (
              <div key={d.label} className="animate-prism-output relative border-l border-border pl-4" style={{ animationDelay: `${i * 0.18}s` }}>
                <div className="flex items-center justify-between font-label text-label-sm uppercase text-muted-foreground">
                  <dt>{d.label}</dt>
                  <dd className={`transition-colors duration-500 ${bad ? "text-danger" : "text-safe"}`}>{d.value}</dd>
                </div>
                <div className="mt-2 h-px overflow-hidden bg-border" aria-hidden>
                  <div
                    className={`h-full transition-[width,background-color] ease-soft ${bad ? "bg-danger" : "bg-primary"}`}
                    style={{ width: `${d.value}%`, transitionDuration: "var(--duration-score)" }}
                  />
                </div>
              </div>
            );
          })}
        </dl>
      </div>

      <figcaption className="relative mt-10 border-t border-border pt-5">
        <div className="flex items-end justify-between">
          <div>
            <div className={`font-heading text-metric font-semibold tracking-tight transition-colors duration-500 ${toneText}`}>
              {scores.trust}
              {scores.capped && <span className="ml-2 align-middle font-label text-label uppercase">capped</span>}
            </div>
            <div className="mt-1 font-label text-label-sm uppercase text-muted-foreground">{HERO.prism.trust}</div>
          </div>
          <div className="text-right font-label text-label-sm uppercase text-muted-foreground">
            <div>{HERO.prism.cycle}</div>
            <div className={`mt-1 transition-colors duration-500 ${statusColor}`}>{Math.round(progress * 100)}%</div>
          </div>
        </div>
        {/* Scan progress through the current cycle */}
        <div className="mt-4 h-px w-full overflow-hidden bg-border" aria-hidden>
          <div className={`h-full transition-colors duration-500 ${toneBg}`} style={{ width: `${progress * 100}%` }} />
        </div>
      </figcaption>
    </figure>
  );
}
