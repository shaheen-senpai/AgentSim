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

export function Logo({ href = `/#${SECTION_IDS.top}` }: { href?: string }) {
  return (
    <Link href={href} onClick={scrollHomeIfHere} className="flex items-center gap-3 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label="AgentSim home">
      <span className="relative grid size-8 place-items-center rounded-full border border-primary/60 bg-primary/10 shadow-[0_0_20px_color-mix(in_oklab,var(--color-signal)_25%,transparent)]">
        <span className="size-2 rotate-45 border border-primary" />
      </span>
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
