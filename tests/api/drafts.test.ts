import { describe, expect, it } from "vitest";
import { GET as listRoute } from "@/app/api/worlds/drafts/route";
import { GET as getRoute } from "@/app/api/worlds/drafts/[draftId]/route";
import { createDraft } from "@/generate/draftRegistry";
import type { DraftSummary } from "@/lib/draftSummary";

const files = { "pack.yaml": "id: x\nentities:\n  a: {}\n  b: {}\n", "tools.yaml": "t1: {}\nt2: {}\nt3: {}\n" };

describe("GET /api/worlds/drafts", () => {
  it("summarises drafts with tool and entity counts, and serves one draft's files", async () => {
    const d = createDraft({ name: "Zed", domain: "support", description: "x" }, { files, errors: [{ file: "seed.yaml", path: "", message: "bad" }], attempts: 2 });
    const list = (await (await listRoute()).json()) as DraftSummary[];
    expect(list.find((s) => s.id === d.id)).toMatchObject({ name: "Zed", domain: "support", valid: false, errorCount: 1, tools: 3, entities: 2 });

    const one = await getRoute(new Request("http://x"), { params: Promise.resolve({ draftId: d.id }) });
    expect(one.status).toBe(200);
    expect(((await one.json()) as { files: Record<string, string> }).files).toEqual(files);
    expect((await getRoute(new Request("http://x"), { params: Promise.resolve({ draftId: "draft_nope" }) })).status).toBe(404);
  });

  it("counts nothing for unparseable draft files instead of failing", async () => {
    const d = createDraft({ name: "Broken", domain: "d", description: "x" }, { files: { "pack.yaml": "a: [" }, errors: [], attempts: 1 });
    const list = (await (await listRoute()).json()) as DraftSummary[];
    expect(list.find((s) => s.id === d.id)).toMatchObject({ valid: true, tools: 0, entities: 0 });
  });
});
