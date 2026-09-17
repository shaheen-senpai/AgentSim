import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost" | "inverse";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-body font-medium " +
  "transition-colors duration-200 ease-soft cursor-pointer select-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_24px_color-mix(in_oklab,var(--color-signal)_22%,transparent)]",
  outline: "border border-border bg-transparent text-foreground hover:border-primary/60 hover:bg-surface",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-surface",
  inverse: "bg-background text-foreground hover:bg-surface",
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
