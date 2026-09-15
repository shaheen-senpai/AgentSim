// In-memory World-pack drafts created via the /mcp/worlds builder. Mirrors the globalThis-pinned
// map in src/runner/registry.ts, and for the same reason: `next dev` re-evaluates this module on
// every request, and a Map declared at plain module scope would lose every draft between one MCP
// tool call and the next. Unlike a live Run, a draft has no external state to reconcile when it
// goes away, so expiry is a lazy age check on read rather than a timer.
import { randomUUID } from "node:crypto";
import type { GenerateInput } from "./worldpack";
import type { PackFiles, ValidationError } from "@/engine/pack";

export type DraftResult = { files: PackFiles; errors: ValidationError[]; attempts: number };

export type Draft = DraftResult & {
  id: string;
  input: GenerateInput;
  createdAt: number;
};

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours — long enough for one authoring session

const g = globalThis as unknown as { __agentsimDrafts?: Map<string, Draft> };
const drafts = (g.__agentsimDrafts ??= new Map<string, Draft>());

function expired(draft: Draft): boolean {
  return Date.now() - draft.createdAt > TTL_MS;
}

export function createDraft(input: GenerateInput, result: DraftResult): Draft {
  const draft: Draft = { id: `draft_${randomUUID()}`, input, ...result, createdAt: Date.now() };
  drafts.set(draft.id, draft);
  return draft;
}

export function getDraft(id: string): Draft | undefined {
  const draft = drafts.get(id);
  if (!draft) return undefined;
  if (expired(draft)) {
    drafts.delete(id);
    return undefined;
  }
  return draft;
}

export function updateDraft(id: string, result: DraftResult): Draft | undefined {
  const prev = getDraft(id); // routes through the same expiry check
  if (!prev) return undefined;
  const next: Draft = { ...prev, ...result };
  drafts.set(id, next);
  return next;
}
