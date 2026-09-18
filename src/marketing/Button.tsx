import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost" | "inverse";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-body font-medium " +
  "transition-colors duration-200 ease-soft cursor-pointer select-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

// A single inset highlight on the primary button, no outer glow: the accent colour does the work.
const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)]",
  outline: "border border-border bg-surface/60 text-foreground hover:border-foreground/25 hover:bg-surface-raised",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-surface",
  inverse: "bg-foreground text-background hover:bg-foreground/90",
};

export function buttonClass(variant: Variant = "primary", extra = ""): string {
  return `${base} ${variants[variant]} ${extra}`;
}

export function LinkButton({ href, variant = "primary", className = "", children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, className)}>
      {children}
    </Link>
  );
}

export function Button({ variant = "primary", className = "", children, ...rest }: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={buttonClass(variant, className)} {...rest}>
      {children}
    </button>
  );
}
