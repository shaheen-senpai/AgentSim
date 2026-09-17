"use client";
// The Mandate tab (design/agentsim-console.html `renderWorldMandate`): the World's own Mandates —
// captured from the agent's real policy by the worldbuilder plugin — and then, per Scenario, the
// table of what every Check binds here and what tries to break it.
//
// A Scenario cites a Mandate rather than copying it (`policy: { mandate: <id> }`), so editing one
// here moves every Scenario that cites it. A Scenario may still carry its own inline text.
import Link from "next/link";
import type { Mandate, Scenario } from "@/engine/pack";
import { EditableText } from "./EditableText";
import { setMandateText } from "./packEdits";
import { checkParams, checksByDimension, lureSummary } from "./packView";
import { useSavePack, ValidationNote } from "./useSavePack";

export function MandateTab({ worldId, files, mandates, scenarios }: { worldId: string; files: Record<string, string>; mandates: Mandate[]; scenarios: Scenario[] }) {
  const { save, errors } = useSavePack(worldId);

  return (
    <>
      {mandates.length === 0 ? (
        <p className="hint" style={{ margin: "0 0 18px" }}>
          No Mandates captured yet — the worldbuilder plugin reads them from the agent&rsquo;s own system prompt and policy docs, and a Scenario can always carry its own inline text instead.
        </p>
      ) : (
        <>
          <h2 style={{ margin: "0 0 4px" }}>Mandates in this World</h2>
          <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "0 0 14px" }}>
            Captured from the agent&rsquo;s own policy. A Scenario cites one instead of copying it, so editing it here moves every Scenario that cites it.
          </p>
          {mandates.map((m) => {
            const citing = scenarios.filter((sc) => sc.policy.mandate === m.id);
            return (
              <div key={m.id} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                  <h3 style={{ margin: 0, fontSize: 13 }}>{m.title ?? m.id}</h3>
                  <span className="mini-tag mono">{m.id}</span>
                </div>
                <EditableText
                  label="Mandate text"
                  value={m.text.trim()}
                  quote
                  rows={4}
                  onSave={(v) => save({ ...files, "pack.yaml": setMandateText(files["pack.yaml"] ?? "", m.id, v) })}
                />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                  Cited by {citing.length > 0 ? citing.map((sc) => sc.title).join(" · ") : "no Scenario yet"}
                </div>
              </div>
            );
          })}
          <div style={{ borderTop: "1px solid var(--border)", margin: "20px 0 18px" }} />
        </>
      )}

      {scenarios.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>No Scenarios yet, so no Mandate is in force. Generate them on the Scenarios tab.</p>
      ) : (
        scenarios.map((sc) => {
          const groups = checksByDimension(sc.checks);
          const policyCheck = sc.checks.find((c) => c.dimension === "policy_compliance");
          return (
            <div key={sc.id} style={{ marginBottom: 26 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <h2 style={{ margin: 0 }}>{sc.title}</h2>
                <span className="mini-tag mono">{sc.id}</span>
              </div>
              <div className="mandate-quote" style={{ fontSize: 12.5, marginBottom: 8 }}>{sc.policy.text.trim()}</div>
              <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 12px" }}>
                {sc.policy.mandate ? (
                  <>Cites the World Mandate <span className="mini-tag mono">{sc.policy.mandate}</span> — edit it above and this follows.</>
                ) : (
                  <>Inline Mandate — this Scenario owns its own text. Edit it on the Scenarios tab.</>
                )}
              </p>
              <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "0 0 16px" }}>
                The Mandate is prose, and prose is not gradeable — so every sentence in it is pinned to something mechanical in this World. That is the table below: what each Check reads, and where it reads it.
              </p>
              <div className="table-wrap" style={{ marginBottom: 14 }}>
                <table className="maptable">
                  <thead>
                    <tr><th>Dimension</th><th>Check</th><th>What it binds here</th></tr>
                  </thead>
                  <tbody>
                    {groups.map((g) =>
                      g.checks.map((c, i) => (
                        <tr key={`${g.dimension}-${i}`}>
                          <td style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>{i === 0 ? <b>{g.label}</b> : ""}</td>
                          <td><span className="ctype">{c.type}</span></td>
                          <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{checkParams(c)}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
              {sc.attacks.map((a) => (
                <div key={a.id} className="inject-box" style={{ margin: "0 0 12px" }}>
                  <b>What tries to break it — {a.id}.</b> {a.title}. Lure: <span className="mono">{lureSummary(a.lure)}</span>
                  {policyCheck ? (
                    <>, which is a call the tools permit and only <span className="mono">{policyCheck.type}</span> catches</>
                  ) : (
                    <> — and no Policy Compliance Check is written for it yet</>
                  )}
                  .
                </div>
              ))}
              <Link className="back-link" style={{ margin: 0 }} href={`/worlds/${worldId}?tab=scenarios&scenario=${encodeURIComponent(sc.id)}`}>
                View the full Scenario — Task Brief, Attacks, every Check →
              </Link>
            </div>
          );
        })
      )}
      <ValidationNote errors={errors} />
    </>
  );
}
