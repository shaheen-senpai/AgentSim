import { SECTION_IDS, WORLDS, WORLDS_SECTION } from "./content";
import { Icon } from "./icons";
import { stagger } from "./stagger";
import { Eyebrow, Section } from "./Section";

export function Worlds() {
  return (
    <Section id={SECTION_IDS.worlds}>
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <Eyebrow>{WORLDS_SECTION.eyebrow}</Eyebrow>
          <h2 className="mt-4 max-w-xl font-heading text-h2 font-medium">{WORLDS_SECTION.title}</h2>
        </div>
        <p className="max-w-xl text-body text-muted-foreground lg:self-end">{WORLDS_SECTION.lead}</p>
      </div>
      <ul className="mt-12 grid gap-4 md:grid-cols-3">
        {WORLDS.map((w, i) => {
          const danger = w.tone === "danger";
          return (
            <li key={w.title} data-reveal-child style={stagger(i)}>
              <article className={`h-full rounded-panel border border-border border-t-4 bg-surface p-6 transition-transform duration-300 ease-soft hover:-translate-y-0.5 ${danger ? "border-t-danger" : "border-t-primary"}`}>
                <Icon name="box" className={`size-5 ${danger ? "text-danger" : "text-primary"}`} />
                <h3 className="mt-10 font-heading text-h3 font-semibold">{w.title}</h3>
                <p className="mt-3 text-caption text-muted-foreground">{w.body}</p>
                <p className={`mt-8 font-label text-label-sm uppercase ${danger ? "text-danger" : "text-primary"}`}>{w.count}</p>
              </article>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
