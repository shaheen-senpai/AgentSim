import Link from "next/link";
import { notFound } from "next/navigation";
import { listPackIds, loadPack, PACK_ID_RE } from "@/engine/pack";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { serif } from "@/ui/styles";
import { ScenarioCard } from "@/ui/worlds/ScenarioCards";

export const dynamic = "force-dynamic";

type Params = Promise<{ packId: string; scenarioId: string }>;

export default async function ScenarioDetailPage({ params }: { params: Params }) {
  const { packId, scenarioId } = await params;

  // Mirrors `/worlds/[id]/page.tsx`'s validate-before-load pattern, one level down: a pack id that
  // isn't installed, or fails to load, or a scenario id that doesn't belong to it, all 404 — this is
  // a read-only derived view, not the pack editor, so there is no separate "show me why it broke"
  // path here the way `/worlds/[id]`'s `LoadError` gives the editor.
  if (!PACK_ID_RE.test(packId) || !listPackIds().includes(packId)) notFound();

  const pack = (() => {
    try {
      return loadPack(packId);
    } catch {
      return null;
    }
  })();
  if (!pack) notFound();

  const scenario = pack.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) notFound();

  return (
    <ConsoleShell>
      <div className="p-4 flex flex-col gap-3 max-w-[900px]">
        <Link href="/scenarios" className="text-[12px] text-[#6E6B60] underline decoration-dotted hover:text-[#1B1A17] self-start">
          ← Scenarios
        </Link>
        <div className="text-xs text-[#6E6B60]">
          Scenarios / <b className="text-[#1B1A17]">{scenario.title}</b>
        </div>
        <h1 className={`${serif} text-[28px] font-medium tracking-tight`}>{scenario.title}</h1>
        <p className="text-[12px] text-[#6E6B60]">
          {pack.meta.name} <span className="font-mono">· {pack.meta.id}</span>
        </p>
        <ScenarioCard packId={pack.meta.id} scenario={scenario} />
      </div>
    </ConsoleShell>
  );
}
