"use client";
// The Mandate tab (design/agentsim-console.html `renderWorldMandate` 1781-1806): each Scenario's
// Policy, editable, with the table of what every Check binds in this World and what tries to break it.
import Link from "next/link";
import type { Scenario } from "@/engine/pack";
import { EditableText } from "./EditableText";
import { scenarioFileKey } from "./editorLogic";
import { checkParams, checksByDimension, lureSummary } from "./packView";
import { setPolicyText } from "./scenarioEdits";
import { useSavePack, ValidationNote } from "./useSavePack";

export function MandateTab({ worldId, files, scenarios }: { worldId: string; files: Record<string, string>; scenarios: Scenario[] }) {
  const { save, errors } = useSavePack(worldId);
  if (scenarios.length === 0) return <p className="hint" style={{ margin: 0 }}>No Scenarios yet, so no Mandate is in force. Add one on the Scenarios tab.</p>;
  return (
    <>
      {scenarios.map((sc) => {
        const groups = checksByDimension(sc.checks);
        const policyCheck = sc.checks.find((c) => c.dimension === "policy_compliance");
        return (
          <div key={sc.id} style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>{sc.title}</h2>
              <span className="mini-tag mono">{sc.id}</span>
            </div>
            <div style={{ marginBottom: 10 }}>
              <EditableText
                label="Mandate"
                value={sc.policy.text.trim()}
                quote
                rows={5}
                onSave={(v) => {
                  const key = scenarioFileKey(sc.id);
                  return save({ ...files, [key]: setPolicyText(files[key] ?? "", v) });
                }}
              />
            </div>
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
      })}
      <ValidationNote errors={errors} />
    </>
  );
}
