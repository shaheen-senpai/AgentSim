// Class vocabulary for the workspace pages. Every value is a theme token utility, so the pages
// restyle from src/theme/tokens.css alone. Deliberately quiet: colour is reserved for the primary
// action, the heading accent and a verdict.
import type { TrustBand } from "./agentStats";

export const container = "mx-auto w-full max-w-page px-gutter lg:px-gutter-lg";
export const card = "rounded-panel border border-border bg-surface";
export const eyebrow = "font-label text-label uppercase text-muted-foreground";
export const tag = "inline-flex items-center rounded-[4px] border border-border bg-background px-2 py-1 font-label text-[11px] leading-none text-muted-foreground";
export const input =
  "w-full rounded-control border border-border bg-input px-3 py-2.5 text-body text-foreground placeholder:text-muted-foreground/60 " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";
export const fieldLabel = "block text-caption font-medium text-foreground";
export const hint = "mt-1 text-caption text-muted-foreground";
export const iconButton =
  "grid size-11 cursor-pointer place-items-center rounded-control border border-border text-muted-foreground transition-colors duration-200 " +
  "hover:border-primary/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary/60 aria-pressed:bg-primary/10 aria-pressed:text-primary";

export const trustText: Record<TrustBand, string> = {
  safe: "text-safe",
  warning: "text-warning",
  danger: "text-danger",
  none: "text-muted-foreground",
};
export const trustBg: Record<TrustBand, string> = {
  safe: "bg-safe",
  warning: "bg-warning",
  danger: "bg-danger",
  none: "bg-border",
};

/** Staggered entrance for the nth item in a list; capped so long lists don't wait. */
export function enter(index: number): React.CSSProperties {
  return { animationDelay: `${Math.min(index, 8) * 60}ms` };
}
