"use client";
// The draft bar (design/agentsim-console.html `renderWorldDetail`, the `.draftbar` block): a World
// built by the plugin, or composed here, waiting for someone to read it. Publishing is the whole
// review gate — until it happens, `POST /api/runs` refuses this World.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { withPackStatus } from "./packEdits";
import { useSavePack, ValidationNote } from "./useSavePack";

export function DraftBar({ worldId, files, scenarioCount }: { worldId: string; files: Record<string, string>; scenarioCount: number }) {
  const router = useRouter();
  const { save, pending, errors } = useSavePack(worldId);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [rotated, setRotated] = useState<string | null>(null);

  async function publish() {
    const saved = await save({ ...files, "pack.yaml": withPackStatus(files["pack.yaml"] ?? "", "ready") });
    // Publishing retires the build token that made this World. The successor comes back with the
    // save, and this is the only moment it can be shown to the person holding the old one.
    if (typeof saved?.rotatedToken === "string") setRotated(saved.rotatedToken);
  }

  async function discard() {
    setDiscarding(true);
    setDiscardError(null);
    try {
      const res = await fetch(`/api/worlds/${worldId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setDiscardError(d.error ?? `The World was not discarded (HTTP ${res.status}).`);
        return;
      }
      router.push("/worlds");
    } catch {
      setDiscardError("Network error — nothing was discarded.");
    } finally {
      setDiscarding(false);
    }
  }

  const busy = pending || discarding;

  return (
    <>
      <div className="draftbar">
        <span className="pill-badge badge-warning">draft</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {scenarioCount > 0
            ? "Read the ownership chain and the Checks, then publish — that is what makes it runnable."
            : "No Scenarios yet, so nothing here is being tested. Generate them on the Scenarios tab, then publish."}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ height: 30, fontSize: 12, color: "var(--danger-fg)", borderColor: "var(--danger-bg)" }}
            disabled={busy}
            onClick={discard}
          >
            {discarding ? "Discarding…" : "Discard"}
          </button>
          <button type="button" className="btn btn-primary" style={{ height: 30, fontSize: 12 }} disabled={busy || scenarioCount === 0} onClick={publish}>
            {pending ? "Publishing…" : "Publish World"}
          </button>
        </span>
      </div>
      <ValidationNote errors={errors} />
      {rotated && (
        <div className="nw-note" style={{ marginTop: 12 }} role="status">
          <b>Published — this World&apos;s build token was rotated.</b>
          <div style={{ marginTop: 4 }}>
            The plugin can no longer write to this World. Its replacement token, for the next World you build:{" "}
            <span className="mono">{rotated}</span>
          </div>
        </div>
      )}
      {discardError && (
        <div className="nw-note" style={{ borderLeftColor: "var(--danger-fg)", color: "var(--danger-fg)" }} role="alert">
          {discardError}
        </div>
      )}
    </>
  );
}
