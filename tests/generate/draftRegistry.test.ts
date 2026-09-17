import { describe, expect, it, vi } from "vitest";
import { createDraft, getDraft, listDrafts, updateDraft } from "@/generate/draftRegistry";
import type { GenerateInput } from "@/generate/worldpack";

const INPUT: GenerateInput = { name: "Acme Helpdesk", domain: "helpdesk", description: "An IT helpdesk." };
const RESULT = { files: { "pack.yaml": "id: acme\n" }, errors: [], attempts: 1 };

describe("draftRegistry", () => {
  it("creates a draft with a fresh id and returns it from getDraft", () => {
    const draft = createDraft(INPUT, RESULT);
    expect(draft.id).toMatch(/^draft_/);
    expect(draft.input).toEqual(INPUT);
    expect(draft.files).toEqual(RESULT.files);
    expect(draft.errors).toEqual([]);
    expect(draft.attempts).toBe(1);
    expect(getDraft(draft.id)).toEqual(draft);
  });

  it("gives every draft a distinct id", () => {
    const a = createDraft(INPUT, RESULT);
    const b = createDraft(INPUT, RESULT);
    expect(a.id).not.toBe(b.id);
  });

  it("returns undefined for an unknown id", () => {
    expect(getDraft("draft_does-not-exist")).toBeUndefined();
  });

  it("updateDraft replaces files/errors/attempts, keeps the original input and id", () => {
    const draft = createDraft(INPUT, RESULT);
    const revised = { files: { "pack.yaml": "id: acme\nname: Acme\n" }, errors: [{ file: "seed.yaml", path: "", message: "missing rows" }], attempts: 1 };

    const updated = updateDraft(draft.id, revised);

    expect(updated).toBeDefined();
    expect(updated!.id).toBe(draft.id);
    expect(updated!.input).toEqual(INPUT);
    expect(updated!.files).toEqual(revised.files);
    expect(updated!.errors).toEqual(revised.errors);
    expect(getDraft(draft.id)).toEqual(updated);
  });

  it("updateDraft on an unknown id returns undefined and creates nothing", () => {
    expect(updateDraft("draft_does-not-exist", RESULT)).toBeUndefined();
    expect(getDraft("draft_does-not-exist")).toBeUndefined();
  });

  it("treats a draft older than the TTL as gone", () => {
    vi.useFakeTimers();
    try {
      const draft = createDraft(INPUT, RESULT);
      vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1000); // just past the 2h TTL
      expect(getDraft(draft.id)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists live drafts newest first and drops expired ones", () => {
    const a = createDraft(INPUT, RESULT);
    const b = createDraft({ ...INPUT, name: "B" }, RESULT);
    (b as { createdAt: number }).createdAt = a.createdAt + 1;
    const stale = createDraft({ ...INPUT, name: "S" }, RESULT);
    (stale as { createdAt: number }).createdAt = Date.now() - 3 * 60 * 60 * 1000;
    const ids = listDrafts().map((d) => d.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
    expect(ids).not.toContain(stale.id);
  });
});
