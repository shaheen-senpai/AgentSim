import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/marketing/icons";
import { card, container, eyebrow } from "../ui";
import { StepStrip } from "./StepStrip";

type Crumb = { label: string; href?: string };

export function WizardShell({ back, crumbs, title, lead, steps, current, children, footer }: { back: Crumb; crumbs: Crumb[]; title: string; lead: string; steps: readonly string[]; current: number; children: ReactNode; footer: ReactNode }) {
  return (
    <main id="main" className={`${container} pb-20 pt-8`}>
      <Link href={back.href ?? "/agents"} className={`${eyebrow} inline-flex items-center gap-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring`}>
        <Icon name="arrow-left" className="size-3.5" /> {back.label}
      </Link>
      <nav aria-label="Breadcrumb" className="mt-4 flex flex-wrap items-center gap-2 text-body text-muted-foreground">
        {crumbs.map((c, i) => (
          <span key={c.label} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden>/</span>}
            {c.href ? <Link href={c.href} className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{c.label}</Link> : <span className="font-medium text-foreground">{c.label}</span>}
          </span>
        ))}
      </nav>
      <h1 className="mt-3 font-heading text-display font-semibold">{title}</h1>
      <p className="mt-3 max-w-3xl text-lead text-muted-foreground">{lead}</p>
      <div className="mt-7">
        <StepStrip steps={steps} current={current} />
      </div>
      <section className={`${card} animate-fade-in mt-6 p-6 sm:p-8`} key={current}>
        {children}
      </section>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">{footer}</div>
    </main>
  );
}
