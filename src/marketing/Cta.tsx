import { CTA, SECTION_IDS } from "./content";
import { LinkButton } from "./Button";
import { Reveal } from "./Reveal";

export function Cta() {
  return (
    <section id={SECTION_IDS.cta} className="scroll-mt-16 py-section">
      <Reveal className="mx-auto max-w-page px-gutter lg:px-gutter-lg">
        <div className="rounded-panel bg-primary px-6 py-16 text-center text-primary-foreground sm:px-12">
          <p className="font-label text-label-sm uppercase">{CTA.eyebrow}</p>
          <h2 className="mx-auto mt-5 max-w-2xl font-heading text-h2 font-semibold">{CTA.title}</h2>
          <p className="mx-auto mt-5 max-w-xl text-body opacity-75">{CTA.lead}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <LinkButton href={CTA.primary.href} variant="inverse">{CTA.primary.label}</LinkButton>
            <LinkButton href={CTA.secondary.href} variant="outline" className="border-background/30 text-primary-foreground hover:bg-background/10 hover:border-background/60">
              {CTA.secondary.label}
            </LinkButton>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
