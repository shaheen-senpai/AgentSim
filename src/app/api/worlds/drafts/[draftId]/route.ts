import { getDraft } from "@/generate/draftRegistry";

export const dynamic = "force-dynamic";

/** One draft's files and outstanding validation errors, for the New world Review step. Read-only. */
export async function GET(_req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const draft = getDraft(draftId);
  if (!draft) return Response.json({ error: "Unknown draft" }, { status: 404 });
  return Response.json({ id: draft.id, files: draft.files, errors: draft.errors, input: draft.input });
}
