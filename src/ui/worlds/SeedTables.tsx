// The Seed tab: one table per collection, in `pack.yaml` declaration order, capped at the first
// `SEED_ROW_LIMIT` rows. Columns come from the entity's declared fields (not from whatever keys
// the first row happens to have), so a collection with no rows at all still shows its shape.
import type { PackMeta, SeedFile } from "@/engine/pack";
import { heading, mono } from "@/ui/styles";
import { cellText, previewRows } from "./packView";

function UntrustedDot() {
  return (
    <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full bg-[#c8321e] align-middle" />
  );
}

export function SeedTables({ meta, seed }: { meta: PackMeta; seed: SeedFile }) {
  const collections = Object.entries(meta.entities);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#6b6b66]">
        <span>
          <span className={mono}>now</span> {seed.now}
        </span>
        <span>
          <span className={mono}>currency</span> {seed.currency}
        </span>
        <span className="flex items-center gap-1">
          <UntrustedDot /> <span className="text-[#c8321e]">untrusted</span> — a field an Attack can plant text in
        </span>
        <span>Long text is clipped; the full value is in the cell&rsquo;s tooltip.</span>
      </div>

      {collections.map(([collection, spec]) => {
        const fields = Object.entries(spec.fields);
        const preview = previewRows(seed.rows[collection] ?? []);
        return (
          <section key={collection} className="flex flex-col gap-1">
            <h2 className="flex items-baseline gap-2">
              <span className="font-semibold text-[13px]">{spec.label}</span>
              <span className={`${mono} text-[11px] text-[#6b6b66]`}>{collection}</span>
              <span className="text-[11px] text-[#6b6b66]">{preview.caption}</span>
            </h2>
            <div className="overflow-x-auto border border-[#cfcfcb] rounded">
              <table className="w-full text-[12px] border-collapse">
                <caption className="sr-only">
                  {spec.label} ({collection}) — {preview.caption}
                </caption>
                <thead>
                  <tr className="bg-[#f4f4f2]">
                    {fields.map(([name, field]) => (
                      <th key={name} scope="col" className="text-left font-semibold px-2 py-1.5 border-b border-[#cfcfcb] whitespace-nowrap align-bottom">
                        <span className={mono}>{name}</span>
                        <span className="block text-[9.5px] font-normal text-[#6b6b66]">
                          {field.untrusted ? (
                            <span className="text-[#c8321e]">
                              <UntrustedDot /> {field.type} · untrusted
                            </span>
                          ) : (
                            field.type
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.shown.length === 0 ? (
                    <tr>
                      <td colSpan={Math.max(1, fields.length)} className="px-2 py-2 text-[#6b6b66] italic">
                        No rows seeded.
                      </td>
                    </tr>
                  ) : (
                    preview.shown.map((row, i) => (
                      <tr key={String(row.id)} className={i % 2 === 1 ? "bg-[#f4f4f2]" : undefined}>
                        {fields.map(([name, field]) => {
                          const cell = cellText(row[name], field);
                          return (
                            <td
                              key={name}
                              title={cell.title ?? undefined}
                              className={`px-2 py-1 border-t border-[#e6e6e2] align-top ${field.type === "text" ? "" : "whitespace-nowrap"} ${
                                field.untrusted ? "text-[#c8321e]" : ""
                              }`}
                            >
                              {cell.text}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {preview.truncated && (
              <p className={`${heading} normal-case tracking-normal`}>
                Showing the first {preview.shown.length} of {preview.total} rows.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
