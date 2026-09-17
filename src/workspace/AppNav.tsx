"use client";
// The signed-in top bar. Same theme as the landing page, none of its marketing weight: four
// sections, the workspace name, and who is signed in.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/marketing/Nav";
import { isCurrentSection } from "@/ui/navigation";
import { container } from "./ui";

const NAV = [
  { href: "/agents", label: "Agents" },
  { href: "/scenarios", label: "Attack lab" },
  { href: "/compare", label: "Ledger" },
  { href: "/runs", label: "Score" },
] as const;

export const WORKSPACE = { name: "Acme Risk", initials: "SR" } as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background" aria-label="Workspace">
      <div className={`${container} flex h-16 items-center gap-4`}>
        <div className="shrink-0"><Logo /></div>
        {/* On narrow screens the sections scroll sideways instead of wrapping or overflowing the page. */}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-body text-muted-foreground [scrollbar-width:none] sm:ml-4 sm:gap-5 [&::-webkit-scrollbar]:hidden">
          {NAV.map((n) => {
            const current = isCurrentSection(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={current ? "page" : undefined}
                className={`nav-link rounded-control px-1.5 py-2 transition-colors duration-200 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${current ? "text-foreground" : ""}`}
              >
                {n.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-4">
          <span className="hidden font-label text-label uppercase text-muted-foreground md:inline">Workspace · {WORKSPACE.name}</span>
          <span className="relative grid size-9 place-items-center rounded-full border border-border bg-surface font-label text-[11px] text-foreground" aria-label={`Signed in as ${WORKSPACE.initials}`}>
            {WORKSPACE.initials}
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-primary" aria-hidden />
          </span>
        </div>
      </div>
    </nav>
  );
}
