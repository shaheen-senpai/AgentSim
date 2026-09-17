import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

/** A full-width band with the page container inside. `tone="surface"` alternates the background. */
export function Section({ id, tone = "base", className = "", children }: { id?: string; tone?: "base" | "surface"; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-16 border-b border-border py-section ${tone === "surface" ? "bg-surface" : ""} ${className}`}>
      <Reveal className="mx-auto max-w-page px-gutter lg:px-gutter-lg">{children}</Reveal>
    </section>
  );
}

export function Eyebrow({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "danger" | "muted" }) {
  const color = tone === "danger" ? "text-danger" : tone === "muted" ? "text-muted-foreground" : "text-primary";
  return <p className={`font-label text-label uppercase ${color}`}>{children}</p>;
}
