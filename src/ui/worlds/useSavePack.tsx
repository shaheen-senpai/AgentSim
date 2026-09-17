"use client";
// Validate, then write, a pack's whole file set — the same two routes the raw editor uses. On
// success the Server Component re-renders with what was saved. Nothing invalid is ever written.
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ValidationError } from "@/engine/pack";

const JSON_HEADERS = { "content-type": "application/json" };

export function useSavePack(worldId: string) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  /** Resolves `true` when the files were saved; otherwise `errors` says why. */
  async function save(files: Record<string, string>): Promise<boolean> {
    setPending(true);
    setErrors([]);
    try {
      const validated = await fetch("/api/worlds/validate", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ files }) });
      const v = (await validated.json()) as { ok: boolean; errors: ValidationError[] };
      if (!v.ok) {
        setErrors(v.errors);
        return false;
      }
      const res = await fetch(`/api/worlds/${worldId}`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ files }) });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string; errors?: ValidationError[] };
        setErrors(d.errors ?? [{ file: "", path: "", message: d.error ?? `Save failed (HTTP ${res.status}).` }]);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setErrors([{ file: "", path: "", message: "Network error — nothing was saved." }]);
      return false;
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
