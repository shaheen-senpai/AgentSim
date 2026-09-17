"use client";
// The small vocabulary the Run page's panels share: a tonal badge, a labelled drawer field, and a
// copy button. Every colour is a theme token, so the page restyles from src/theme/tokens.css.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { eyebrow } from "../ui";

export type Tone = "danger" | "warning" | "safe" | "muted";

const BADGE: Record<Tone, string> = {
  danger: "border-danger/50 bg-danger/10 text-danger",
  warning: "border-warning/50 bg-warning/10 text-warning",
  safe: "border-primary/50 bg-primary/10 text-primary",
  muted: "border-border bg-background text-muted-foreground",
};

export function Badge({ tone, children, className = "" }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-[4px] border px-2 py-1 font-label text-[10px] uppercase leading-none tracking-[0.06em] ${BADGE[tone]} ${className}`}>{children}</span>;
}

/** The tiny uppercase flag on a Flow node or a List row. */
export function Flag({ tone, children }: { tone: "danger" | "muted"; children: ReactNode }) {
  return <span className={`rounded-[3px] px-1.5 py-0.5 font-label text-[8.5px] font-bold uppercase leading-none tracking-[0.03em] ${tone === "danger" ? "bg-danger/15 text-danger" : "bg-surface-raised text-muted-foreground"}`}>{children}</span>;
}

/** The monospace value box under an eyebrow label, used by every drawer field. */
export const valueBox = "rounded-control border border-border bg-background px-3 py-2 font-label text-caption text-foreground";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <p className={eyebrow}>{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

type CopyState = "idle" | "copied" | "failed";

/**
 * Copying is announced, not only shown: the confirmation lives in a `role="status"` region, and a
 * clipboard the browser refuses (insecure origin, denied permission) says so instead of pretending.
 */
export function CopyButton({ text, what }: { text: string; what: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <button type="button" onClick={copy} className="cursor-pointer rounded-control border border-border px-2.5 py-1.5 font-label text-[11px] text-muted-foreground transition-colors duration-200 hover:border-primary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        Copy
      </button>
      <span role="status" aria-live="polite" className="font-label text-[11px]">
        {state === "copied" && <span className="text-primary">{what} copied</span>}
        {state === "failed" && <span className="text-danger">Could not copy — select it and copy by hand</span>}
      </span>
    </span>
  );
}
