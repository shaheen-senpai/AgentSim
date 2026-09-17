"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AUTH, NAV, SECTION_IDS } from "./content";
import { Icon } from "./icons";
import { LinkButton } from "./Button";

/** Which section is currently on screen, by anchor id; drives the nav's sliding underline. */
function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        let best: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of visible) if (ratio > bestRatio) { best = id; bestRatio = ratio; }
        setActive(best);
      },
      { threshold: [0.15, 0.35, 0.6], rootMargin: "-64px 0px -40% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

/** Already on the landing page? Scroll to the hero instead of relying on a hash change that may not fire. */
function scrollHomeIfHere(e: React.MouseEvent<HTMLAnchorElement>) {
  if (window.location.pathname !== "/") return;
  e.preventDefault();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  window.history.replaceState(null, "", "/");
}

/**
 * The mark: a World drawn as a rounded frame with one edge left open, the agent as the node inside
 * it, and a probe coming in through the gap. Frame and node take the primary colour; the probe is
 * the text colour, so it reads against the green at 16px as well as at 32px.
 */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} shrink-0 drop-shadow-[0_0_10px_color-mix(in_oklab,var(--color-signal)_35%,transparent)]`} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h9M3 6v12M6 21h12a3 3 0 0 0 3-3V9M3 6a3 3 0 0 1 3-3M3 18a3 3 0 0 0 3 3" className="stroke-primary" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.2" className="fill-primary" />
      <path d="M18.5 5.5 21 3" className="stroke-foreground" strokeWidth="1.8" />
    </svg>
  );
}

export function Logo({ href = `/#${SECTION_IDS.top}` }: { href?: string }) {
  return (
    <Link href={href} onClick={scrollHomeIfHere} className="flex items-center gap-3 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label="AgentSim home">
      <LogoMark className="size-8" />
      <span className="font-heading text-xl font-semibold tracking-tight">
        Agent<span className="text-primary">Sim</span>
      </span>
    </Link>
  );
}

const SECTION_LIST = NAV.map((n) => n.href.slice(1));

export function Nav() {
  const [open, setOpen] = useState(false);
  const active = useActiveSection(SECTION_LIST);

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl" aria-label="Primary">
      <div className="mx-auto flex h-16 max-w-page items-center px-gutter lg:px-gutter-lg">
        <Logo />
        <div className="ml-12 hidden items-center gap-8 text-body text-muted-foreground lg:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              aria-current={active === n.href.slice(1) ? "true" : undefined}
              className="nav-link py-2 transition-colors duration-200 hover:text-foreground aria-[current=true]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {n.label}
            </a>
          ))}
        </div>
        <div className="ml-auto hidden items-center gap-2 sm:flex">
          <LinkButton href={AUTH.signin.href} variant="ghost">{AUTH.signin.label}</LinkButton>
          <LinkButton href={AUTH.signup.href}>
            {AUTH.signup.label} <Icon name="arrow-right" className="size-4" />
          </LinkButton>
        </div>
        <button
          type="button"
          className="ml-auto grid size-11 place-items-center rounded-control text-foreground sm:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name={open ? "close" : "menu"} className="size-5" />
        </button>
      </div>
      {open && (
        <div id="mobile-menu" className="border-t border-border bg-background p-5 sm:hidden">
          <div className="flex flex-col gap-1 text-body">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-control px-2 py-3 text-muted-foreground hover:bg-surface hover:text-foreground">
                {n.label}
              </a>
            ))}
            <div className="mt-3 flex gap-2">
              <LinkButton href={AUTH.signin.href} variant="outline" className="flex-1">{AUTH.signin.label}</LinkButton>
              <LinkButton href={AUTH.signup.href} className="flex-1">{AUTH.signup.label}</LinkButton>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
