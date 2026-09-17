import { REGRESSION, SECTION_IDS } from "./content";
import { Icon } from "./icons";
import { stagger } from "./stagger";
import { Eyebrow, Section } from "./Section";

export function Regression() {
  const { card } = REGRESSION;
  return (
    <Section id={SECTION_IDS.score} tone="surface">
      <div className="grid gap-12 lg:grid-cols-2">
        <div>
          <Eyebrow>{REGRESSION.eyebrow}</Eyebrow>
          <h2 className="mt-4 font-heading text-h2 font-medium">{REGRESSION.title}</h2>
          <p className="mt-5 max-w-lg text-body text-muted-foreground">{REGRESSION.lead}</p>
          <div data-reveal-child style={stagger(0)} className="mt-8 rounded-panel border border-border bg-background p-5 font-label text-label">
            {REGRESSION.runs.map((r, i) => (
              <div key={r.id} className={`flex justify-between gap-4 border-b border-border ${i === 0 ? "pb-3" : "py-3"}`}>
                <span>{r.id}</span>
                <span className={r.tone === "danger" ? "text-danger" : "text-safe"}>{r.result}</span>
              </div>
            ))}
            <p className="pt-3 text-muted-foreground">{REGRESSION.change}</p>
          </div>
        </div>

        <div data-reveal-child style={stagger(1)} className="rounded-panel border border-border bg-background p-6">
          <div className="flex items-center justify-between font-label text-label-sm uppercase text-muted-foreground">
            <span>{card.kicker}</span>
            <span className="bg-primary px-2 py-1 text-primary-foreground">{card.badge}</span>
          </div>
          <dl className="mt-8 grid grid-cols-3 gap-3">
            {card.scores.map((s) => (
              <div key={s.label} className="bg-surface p-4">
                <dt className="font-label text-[8px] uppercase tracking-widest text-muted-foreground">{s.label}</dt>
                <dd className="mt-2 font-heading text-metric-sm font-semibold text-primary">{s.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex items-center gap-3 border border-border bg-surface p-4">
            <Icon name="check" className="size-5 shrink-0 text-primary" />
            <div>
              <p className="text-body font-semibold">{card.evidenceTitle}</p>
              <p className="mt-1 text-label text-muted-foreground">{card.evidenceBody}</p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
