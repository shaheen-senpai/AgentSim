"use client";
import { useEffect, useRef, useState } from "react";
import { HERO, SECTION_IDS } from "./content";
import { Button, LinkButton } from "./Button";
import { Icon } from "./icons";
import { MandatePrism } from "./MandatePrism";
import { cycleProgress, phaseAt, type PrismPhase } from "./prismModel";

const TICK_MS = 100;

/** Drives the prism's scan → detect → verify loop off a wall clock; "Replay shift" restarts it. */
function usePrismCycle(): { phase: PrismPhase; progress: number; restart: () => void } {
  const [phase, setPhase] = useState<PrismPhase>("scanning");
  const [progress, setProgress] = useState(0);
  const startedAt = useRef<number>(0);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) {
      // No looping for reduced-motion users: show the moment the product is about.
      setPhase("detected");
      setProgress(0.5);
      return;
    }
    startedAt.current = performance.now();
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const elapsed = performance.now() - startedAt.current;
      setPhase(phaseAt(elapsed));
      setProgress(cycleProgress(elapsed));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const restart = () => {
    if (reduced.current) return;
    startedAt.current = performance.now();
    setPhase("scanning");
    setProgress(0);
  };

  return { phase, progress, restart };
}

export function Hero() {
  const { phase, progress, restart } = usePrismCycle();

  return (
    <section id={SECTION_IDS.top} className="grid-field relative flex min-h-[760px] items-center overflow-hidden border-b border-border pt-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,color-mix(in_oklab,var(--color-safe)_7%,transparent),transparent_42%)]" aria-hidden />
      <div className="relative mx-auto grid w-full max-w-page items-center gap-10 px-gutter py-16 lg:grid-cols-[.9fr_1.1fr] lg:px-gutter-lg">
        <div className="animate-reveal z-10">
          <div className="mb-6 flex items-center gap-2 font-label text-label uppercase text-primary">
            <span className="animate-radar-pulse size-1.5 rounded-full bg-safe" aria-hidden />
            {HERO.eyebrow}
          </div>
          <h1 className="max-w-[10ch] font-heading text-display font-medium">
            {HERO.title}
            <span className="text-primary">{HERO.titleAccent}</span>
          </h1>
          <p className="mt-7 max-w-xl text-lead text-muted-foreground">{HERO.lead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href={HERO.primary.href}>
              {HERO.primary.label} <Icon name="arrow-right" className="size-4" />
            </LinkButton>
            <Button variant="outline" onClick={restart}>
              <Icon name="play" className="size-4" /> {HERO.replay}
            </Button>
          </div>
        </div>
        <div className="animate-reveal [animation-delay:150ms]">
          <MandatePrism phase={phase} progress={progress} />
        </div>
      </div>
    </section>
  );
}
