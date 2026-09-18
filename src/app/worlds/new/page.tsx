// `/worlds/new` — compose a World from real sources, review a worldbuilder draft, or copy a pack.
// A Server Component that gathers what the island cannot reach: the provider catalogs, the
// installed packs, the live drafts, and — with `?draft=` — one draft's files.
import type { Metadata } from "next";
import { getDraft, listDrafts } from "@/generate/draftRegistry";
import { summarizeDraft } from "@/lib/draftSummary";
import { listProviders } from "@/lib/providers";
import { loadPacks } from "@/lib/summaries";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { NewWorld, type DraftForReview } from "@/ui/worlds/newWorld/NewWorld";
import type { PackPick } from "@/ui/worlds/newWorld/sources";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New world · AgentSim Console" };

export default async function NewWorldPage({ searchParams }: { searchParams: Promise<{ draft?: string | string[] }> }) {
  const { draft } = await searchParams;
  const packs: PackPick[] = loadPacks().packs.map((p) => ({
    id: p.meta.id,
    name: p.meta.name,
    domain: p.meta.domain,
    description: p.meta.description,
    entities: Object.keys(p.meta.entities).length,
    tools: Object.keys(p.tools).length,
  }));
  const wanted = Array.isArray(draft) ? draft[0] : draft;
  const found = wanted ? getDraft(wanted) : undefined;
  const initialDraft: DraftForReview | null = found
    ? { id: found.id, files: found.files, errors: found.errors, input: { name: found.input.name, domain: found.input.domain, description: found.input.description } }
    : null;
  // eslint-disable-next-line react-hooks/purity -- a Server Component renders once per request; one clock reading keeps every draft's age consistent
  const now = Date.now();
  return (
    <ConsoleShell>
      <NewWorld providers={listProviders()} packs={packs} drafts={listDrafts().map(summarizeDraft)} initialDraft={initialDraft} now={now} />
    </ConsoleShell>
  );
}
