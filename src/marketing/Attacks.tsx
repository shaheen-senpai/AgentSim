import { ATTACKS, ATTACKS_SECTION, SECTION_IDS } from "./content";
import { LinkButton } from "./Button";
import { Icon } from "./icons";
import { stagger } from "./stagger";
import { Eyebrow, Section } from "./Section";

export function Attacks() {
  return (
    <Section id={SECTION_IDS.attacks} tone="surface">
      <div className="grid gap-12 lg:grid-cols-[.85fr_1.15fr]">
        <div>
          <Eyebrow>{ATTACKS_SECTION.eyebrow}</Eyebrow>
          <h2 className="mt-4 font-heading text-h2 font-medium">{ATTACKS_SECTION.title}</h2>
          <p className="mt-5 max-w-lg text-body text-muted-foreground">{ATTACKS_SECTION.lead}</p>
          <LinkButton href={ATTACKS_SECTION.link.href} variant="outline" className="mt-7">
            {ATTACKS_SECTION.link.label} <Icon name="arrow-right" className="size-4" />
          </LinkButton>
        </div>
        <ul className="space-y-3">
          {ATTACKS.map((a, i) => (
            <li key={a.title} data-reveal-child style={stagger(i)}>
              <article className="rounded-panel border border-border bg-background p-5 transition-colors duration-200 hover:border-danger/40">
                <div className="flex gap-4">
                  <div className="min-w-0 flex-1">
                    <Eyebrow tone="danger">{a.kind}</Eyebrow>
                    <h3 className="mt-2 font-heading text-body font-semibold">{a.title}</h3>
                    <p className="mt-2 text-caption text-muted-foreground">{a.body}</p>
                  </div>
                  <span className="h-fit shrink-0 rounded-control border border-danger/30 bg-danger/10 px-2 py-1 font-label text-label text-danger">{a.badge}</span>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
