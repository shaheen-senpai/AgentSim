import { listDrafts } from "@/generate/draftRegistry";
import { summarizeDraft } from "@/lib/draftSummary";

export const dynamic = "force-dynamic";

/** Every live worldbuilder draft (`/mcp/worlds` → `register_agent`), newest first. Read-only. */
export async function GET() {
  return Response.json(listDrafts().map(summarizeDraft));
}
