import { FEATURES, PRODUCT, SCORE_ROW, SECTION_IDS } from "./content";
import { Icon, type IconName } from "./icons";
import { stagger } from "./stagger";
import { Eyebrow, Section } from "./Section";

export function Features() {
  return (
    <Section id={SECTION_IDS.product}>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
        <div>
          <Eyebrow>{PRODUCT.eyebrow}</Eyebrow>
          <h2 className="mt-4 max-w-xl font-heading text-h2 font-medium">{PRODUCT.title}</h2>
        </div>
        <p className="max-w-xl text-body text-muted-foreground">{PRODUCT.lead}</p>
      </div>

      <ul className="mt-12 grid gap-3 md:grid-cols-3">
        {FEATURES.map((f, i) => (
          <li key={f.step} data-reveal-child style={stagger(i)} className="rounded-panel border border-border bg-surface p-6 transition-colors duration-200 hover:border-primary/40">
            <span className="grid size-9 place-items-center rounded-control border border-primary/25 bg-primary/10 text-primary">
              <Icon name={f.icon as IconName} className="size-4" />
            </span>
            <p className="mt-8 font-label text-label-sm uppercase text-primary">{f.step} · {f.kicker}</p>
            <h3 className="mt-2 font-heading text-h3 font-semibold">{f.title}</h3>
            <p className="mt-3 text-caption text-muted-foreground">{f.body}</p>
          </li>
        ))}
      </ul>

      <div data-reveal-child style={stagger(FEATURES.length)} className="mt-3 grid items-center gap-6 rounded-panel border border-border bg-surface p-6 md:grid-cols-[1fr_auto]">
        <div className="flex items-center gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary text-primary-foreground">
            <Icon name="gauge" className="size-5" />
          </span>
          <div>
            <p className="font-label text-label-sm uppercase text-primary">{SCORE_ROW.step} · {SCORE_ROW.kicker}</p>
            <h3 className="mt-1 font-heading text-h3 font-semibold">{SCORE_ROW.title}</h3>
            <p className="mt-1 text-caption text-muted-foreground">{SCORE_ROW.body}</p>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          {SCORE_ROW.metrics.map((m) => (
            <div key={m.label} className="min-w-24 rounded-control border border-border bg-background px-4 py-3">
              <dt className="font-label text-label-sm uppercase text-muted-foreground">{m.label}</dt>
              <dd className="mt-1 font-heading text-xl font-semibold tracking-tight text-foreground">{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
