"use client";
// A World the plugin built (or the wizard composed), waiting for someone to read it. Publishing is
// the whole review gate — until it happens, `POST /api/runs` refuses this World. The same two calls
// as the console's draft bar (`src/ui/worlds/DraftBar.tsx`), in the workspace theme.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/marketing/Button";
import { withPackStatus } from "@/ui/worlds/packEdits";
import { useSavePack } from "@/ui/worlds/useSavePack";
import { FailureNote, SaveNote } from "./SaveNote";

export function DraftBar({ worldId, agentId, files, scenarioCount }: { worldId: string; agentId: string; files: Record<string, string>; scenarioCount: number }) {
  const router = useRouter();
  const { save, pending, errors } = useSavePack(worldId);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  const publish = () => save({ ...files, "pack.yaml": withPackStatus(files["pack.yaml"] ?? "", "ready") });

  async function discard() {
    if (!window.confirm(`Discard ${worldId}? Its files are deleted; the agent stays.`)) return;
    setDiscarding(true);
    setDiscardError(null);
    try {
      const res = await fetch(`/api/worlds/${worldId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setDiscardError(d.error ?? `The World was not discarded (HTTP ${res.status}).`);
        return;
      }
      router.push(`/agents/${agentId}`);
    } catch {
      setDiscardError("Network error — nothing was discarded.");
    } finally {
      setDiscarding(false);
    }
  }

  const busy = pending || discarding;
  return (
    <div className="animate-reveal mt-6">
      <div className="flex flex-wrap items-center gap-4 rounded-panel border border-warning/40 bg-warning/5 px-5 py-4">
        <span className="rounded-full border border-warning/50 px-2 py-0.5 font-label text-[10px] uppercase text-warning">draft</span>
        <p className="min-w-0 flex-1 text-caption text-muted-foreground">
          {scenarioCount > 0
            ? "Read the ownership chain and the Checks, then publish — that is what makes it runnable."
            : "No Scenarios yet, so nothing here is being tested. Generate them on the Scenarios tab, then publish."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="min-h-9 text-caption text-danger hover:border-danger/60" disabled={busy} onClick={() => void discard()}>
            {discarding ? "Discarding…" : "Discard"}
          </Button>
          <Button className="min-h-9 text-caption" disabled={busy || scenarioCount === 0} onClick={() => void publish()}>
            {pending ? "Publishing…" : "Publish World"}
          </Button>
        </div>
      </div>
      <SaveNote errors={errors} title="Not published" />
      <FailureNote message={discardError} />
    </div>
  );
}
