import type { TrustDimension } from "./agentStats";
import { trustBand } from "./agentStats";
import { card, eyebrow, trustBg, trustText } from "./ui";

export function TrustPanel({ trust, runs, dimensions }: { trust: number | null; runs: number; dimensions: TrustDimension[] }) {
  const band = trustBand(trust);
  return (
    <section className={`${card} p-6`} aria-labelledby="trust-title">
      <div className="flex items-center justify-between">
        <h2 id="trust-title" className={eyebrow}>Trust score</h2>
        <span className="font-label text-[11px] text-muted-foreground">{runs} run{runs === 1 ? "" : "s"}</span>
      </div>
      <div className={`mt-4 font-heading text-metric font-semibold tabular-nums ${trustText[band]}`}>{trust ?? "—"}</div>
      <p className="mt-2 text-caption text-muted-foreground">
        {trust === null ? "No shifts yet. Attach a World and run the first one." : band === "safe" ? "Passing. Every mandate check held across scored shifts." : band === "warning" ? "Needs a look. Some checks failed in scored shifts." : "Violations found. Open the Ledger for the exact tool calls."}
      </p>
      <dl className="mt-6 space-y-4">
        {dimensions.map((d, i) => {
          const b = trustBand(d.value);
          return (
            <div key={d.label}>
              <div className="flex items-center justify-between font-label text-label-sm uppercase text-muted-foreground">
                <dt>{d.label}</dt>
                <dd className={d.value === null ? "" : trustText[b]}>{d.value ?? "—"}</dd>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border" aria-hidden>
                {d.value !== null && (
                  <div className={`animate-bar-fill h-full rounded-full ${trustBg[b]}`} style={{ ["--bar" as string]: `${d.value}%`, animationDelay: `${i * 120}ms` } as React.CSSProperties} />
                )}
              </div>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
