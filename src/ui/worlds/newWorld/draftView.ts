// What the New world Review step shows of a draft pack — read straight from its YAML files, so a
// draft that does not yet validate still previews. Browser-safe; `tests/ui/draftView.test.ts`.
import { parse } from "yaml";
import type { Check, Lure } from "@/engine/pack";
import { checkParams, lureSummary } from "../packView";

type Files = Record<string, string>;

function yaml(text: string | undefined): unknown {
  try {
    return parse(text ?? "") ?? null;
  } catch {
    return null;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export type DraftEntity = { name: string; prefix: string; untrusted: string | null };
export type DraftTool = { name: string; system: string; description: string };
export type DraftScenario = { title: string; policy: string; checks: { dimension: string; type: string; params: string }[]; attack: { id: string; title: string; lure: string } | null };

export function draftEntities(files: Files): DraftEntity[] {
  const pack = yaml(files["pack.yaml"]);
  if (!isObject(pack) || !isObject(pack.entities)) return [];
  return Object.entries(pack.entities).map(([name, e]) => {
    const spec = isObject(e) ? e : {};
    const fields = isObject(spec.fields) ? spec.fields : {};
    const untrusted = Object.entries(fields).find(([, f]) => isObject(f) && f.untrusted === true)?.[0] ?? null;
    return { name, prefix: typeof spec.id_prefix === "string" ? spec.id_prefix : "—", untrusted };
  });
}

export function draftTools(files: Files): DraftTool[] {
  const tools = yaml(files["tools.yaml"]);
  if (!isObject(tools)) return [];
  return Object.entries(tools).map(([name, t]) => {
    const def = isObject(t) ? t : {};
    return { name, system: typeof def.system === "string" ? def.system : "—", description: typeof def.description === "string" ? def.description : "" };
  });
}

/** The first Scenario file (alphabetical), or null when the draft has none. */
export function draftScenario(files: Files): DraftScenario | null {
  const key = Object.keys(files).filter((k) => k.startsWith("scenarios/")).sort()[0];
  if (!key) return null;
  const s = yaml(files[key]);
  if (!isObject(s)) return null;
  const checks = Array.isArray(s.checks)
    ? s.checks.filter(isObject).map((c) => ({ dimension: String(c.dimension ?? ""), type: String(c.type ?? ""), params: checkParams(c as unknown as Check) }))
    : [];
  const first = Array.isArray(s.attacks) ? s.attacks.find(isObject) : undefined;
  const policy = isObject(s.policy) && typeof s.policy.text === "string" ? s.policy.text.trim() : "";
  return {
    title: String(s.title ?? ""),
    policy,
    checks,
    attack: first ? { id: String(first.id ?? ""), title: String(first.title ?? ""), lure: isObject(first.lure) ? lureSummary(first.lure as unknown as Lure) : "—" } : null,
  };
}
