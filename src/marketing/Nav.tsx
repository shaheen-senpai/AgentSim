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
 * The mark is the product in three shapes: a hexagonal World (the sealed, seeded business), the
 * agent as the node inside it, and the Attack as a red wedge coming in through a gap in the wall,
 * aimed at the agent. The wall is the primary colour, the node the text colour and the wedge the
 * violation red, so the story survives at 16px; src/app/icon.svg is the same drawing.
 */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} shrink-0`} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="agentsim-wall" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="color-mix(in oklab, var(--color-primary) 70%, white)" />
          <stop offset="1" stopColor="var(--color-primary)" />
        </linearGradient>
      </defs>
      <path d="M9.95 3.69 12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5l2.05-1.19" stroke="url(#agentsim-wall)" strokeWidth="1.9" />
      <circle cx="12.8" cy="13.4" r="2.9" className="fill-foreground" />
      <path d="M10.25 8.95 7.63 0.41 4.17 2.41Z" className="fill-danger" />
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
