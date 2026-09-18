import { CTA, SECTION_IDS } from "./content";
import { LinkButton } from "./Button";
import { Reveal } from "./Reveal";

export function Cta() {
  return (
    <section id={SECTION_IDS.cta} className="scroll-mt-16 py-section">
      <Reveal className="mx-auto max-w-page px-gutter lg:px-gutter-lg">
        <div className="relative overflow-hidden rounded-panel border border-border bg-surface px-6 py-16 text-center sm:px-12">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,color-mix(in_oklab,var(--color-primary)_18%,transparent),transparent_60%)]" aria-hidden />
          <div className="relative">
            <p className="font-label text-label uppercase text-primary">{CTA.eyebrow}</p>
            <h2 className="mx-auto mt-5 max-w-2xl font-heading text-h2 font-semibold text-balance">{CTA.title}</h2>
            <p className="mx-auto mt-5 max-w-xl text-body text-muted-foreground">{CTA.lead}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <LinkButton href={CTA.primary.href}>{CTA.primary.label}</LinkButton>
              <LinkButton href={CTA.secondary.href} variant="outline">{CTA.secondary.label}</LinkButton>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
