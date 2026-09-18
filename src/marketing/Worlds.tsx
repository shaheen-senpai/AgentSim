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
          const generated = w.tone === "generated";
          return (
            <li key={w.title} data-reveal-child style={stagger(i)}>
              <article className={`h-full rounded-panel border bg-surface p-6 transition-colors duration-300 ease-soft hover:border-foreground/20 ${generated ? "border-dashed border-primary/40" : "border-border"}`}>
                <span className="grid size-9 place-items-center rounded-control border border-primary/25 bg-primary/10 text-primary">
                  <Icon name={generated ? "terminal" : "box"} className="size-4" />
                </span>
                <h3 className="mt-8 font-heading text-h3 font-semibold">{w.title}</h3>
                <p className="mt-3 text-caption text-muted-foreground">{w.body}</p>
                <p className="mt-8 font-label text-label-sm uppercase text-primary">{w.count}</p>
              </article>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
