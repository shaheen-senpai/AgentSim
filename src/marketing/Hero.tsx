"use client";
import { useEffect, useRef, useState } from "react";
import { HERO, SECTION_IDS } from "./content";
import { LinkButton } from "./Button";
import { Icon } from "./icons";
import { MandatePrism } from "./MandatePrism";
import { cycleProgress, phaseAt, type PrismPhase } from "./prismModel";

const TICK_MS = 100;

/** Drives the diagram's run → lure taken → clean loop off a wall clock. */
function usePrismCycle(): { phase: PrismPhase; progress: number } {
  const [phase, setPhase] = useState<PrismPhase>("scanning");
  const [progress, setProgress] = useState(0);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    startedAt.current = performance.now();
    const id = window.setInterval(() => {
      if (reduced) {
        // No looping for reduced-motion users: show the moment the product is about, once.
        setPhase("detected");
        setProgress(0.5);
        window.clearInterval(id);
        return;
      }
      if (document.hidden) return;
      const elapsed = performance.now() - startedAt.current;
      setPhase(phaseAt(elapsed));
      setProgress(cycleProgress(elapsed));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return { phase, progress };
}

export function Hero() {
  const { phase, progress } = usePrismCycle();

  return (
    <section id={SECTION_IDS.top} className="grid-field relative flex min-h-svh items-center overflow-hidden border-b border-border pt-16">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,color-mix(in_oklab,var(--color-primary)_10%,transparent),transparent_55%)]" aria-hidden />
      <div className="relative mx-auto grid w-full max-w-page items-center gap-10 px-gutter py-14 lg:grid-cols-[.9fr_1.1fr] lg:px-gutter-lg lg:py-20">
        <div className="animate-reveal z-10">
          <div className="mb-6 flex items-center gap-2 font-label text-label uppercase text-primary">
            <span className="animate-radar-pulse size-1.5 rounded-full bg-safe" aria-hidden />
            {HERO.eyebrow}
          </div>
          <h1 className="max-w-[11ch] font-heading text-display font-semibold text-balance">
            {HERO.title}
            <span className="text-primary">{HERO.titleAccent}</span>
          </h1>
          <p className="mt-6 max-w-md text-body text-muted-foreground">{HERO.lead}</p>
          <div className="mt-8">
            <LinkButton href={HERO.primary.href}>
              {HERO.primary.label} <Icon name="arrow-right" className="size-4" />
            </LinkButton>
          </div>
        </div>
        <div className="animate-reveal [animation-delay:150ms]">
          <MandatePrism phase={phase} progress={progress} />
        </div>
      </div>
    </section>
  );
}
