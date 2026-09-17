"use client";
// Validate, then write, a pack's whole file set — the same two routes the raw editor uses. On
// success the Server Component re-renders with what was saved. Nothing invalid is ever written.
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ValidationError } from "@/engine/pack";

/** What `PUT /api/worlds/<id>` answers with: the World summary, plus a rotated token on publication. */
export type SaveResult = Record<string, unknown> & { rotatedToken?: string };

const JSON_HEADERS = { "content-type": "application/json" };

export function useSavePack(worldId: string) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  /**
   * Resolves the saved World (truthy) when the files were written, `null` when they were not — in
   * which case `errors` says why. The body is handed back rather than swallowed because publishing
   * returns the rotated build token, and the only moment that token can be shown is right here.
   */
  async function save(files: Record<string, string>): Promise<SaveResult | null> {
    setPending(true);
    setErrors([]);
    try {
      const validated = await fetch("/api/worlds/validate", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ files }) });
      const v = (await validated.json()) as { ok: boolean; errors: ValidationError[] };
      if (!v.ok) {
        setErrors(v.errors);
        return null;
      }
      const res = await fetch(`/api/worlds/${worldId}`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ files }) });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string; errors?: ValidationError[] };
        setErrors(d.errors ?? [{ file: "", path: "", message: d.error ?? `Save failed (HTTP ${res.status}).` }]);
        return null;
      }
      const saved = (await res.json().catch(() => ({}))) as SaveResult;
      router.refresh();
      return saved;
    } catch {
      setErrors([{ file: "", path: "", message: "Network error — nothing was saved." }]);
      return null;
    } finally {
      setPending(false);
    }
  }

  return { save, pending, errors, clearErrors: () => setErrors([]) };
}

/** The mock has no error slot; validation problems render as a note in the danger palette. */
export function ValidationNote({ errors }: { errors: ValidationError[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="nw-note" style={{ borderLeftColor: "var(--danger-fg)", color: "var(--danger-fg)", marginTop: 12 }} role="alert">
      <b>Not saved — {errors.length} problem{errors.length === 1 ? "" : "s"}.</b>
      {errors.map((e, i) => (
        <div key={i} style={{ marginTop: 4 }}>
          {e.file && <span className="mono">{e.file}{e.path ? ` · ${e.path}` : ""}: </span>}
          {e.message}
        </div>
      ))}
    </div>
  );
}
