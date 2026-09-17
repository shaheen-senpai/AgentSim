import { Icon } from "@/marketing/icons";

/** How → Compose → Review. Done steps show a check, the current one is outlined, later ones are muted. */
export function StepStrip({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Steps">
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={label} className="flex items-center gap-2">
            <div
              aria-current={state === "current" ? "step" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-full border px-4 pr-5 transition-colors duration-300 ${
                state === "current" ? "border-primary/70 bg-primary/10 text-foreground" : state === "done" ? "border-border bg-surface text-foreground" : "border-border text-muted-foreground"
              }`}
            >
              <span className={`grid size-7 place-items-center rounded-full font-label text-[11px] ${state === "done" ? "bg-primary text-primary-foreground" : state === "current" ? "bg-primary/20 text-primary" : "bg-surface-raised text-muted-foreground"}`}>
                {state === "done" ? <Icon name="check" className="size-4" /> : i + 1}
              </span>
              <span className="text-body font-medium">{label}</span>
            </div>
            {i < steps.length - 1 && <span className={`h-px w-6 ${i < current ? "bg-primary/60" : "bg-border"}`} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
