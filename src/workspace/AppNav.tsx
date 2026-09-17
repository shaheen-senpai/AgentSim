"use client";
// The signed-in top bar: the mark (back to the landing page), the workspace name, and who is signed in.
import { Logo } from "@/marketing/Nav";
import { container } from "./ui";

export const WORKSPACE = { name: "Acme Risk", initials: "SR" } as const;

export function AppNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background" aria-label="Workspace">
      <div className={`${container} flex h-14 items-center gap-4`}>
        <div className="shrink-0"><Logo /></div>
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
