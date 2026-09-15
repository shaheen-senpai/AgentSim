// `docs/worldpack-format.md` is two things at once: the reference a human authoring a World pack
// reads, and the bulk of the system prompt the generator sends Claude (`./worldpack.ts`). This
// module is the only place that knows where it lives and how its worked example is marked up, so
// the doc stays the single source of truth — the "Minimal skeleton" offered by `/worlds/new` is
// the very example the model is shown, not a second copy that can drift from it.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PackFiles } from "@/engine/pack";

export const FORMAT_DOC_PATH = "docs/worldpack-format.md";

/** The DSL reference, read from the repo. */
export function loadFormatDoc(): string {
  return readFileSync(path.join(process.cwd(), FORMAT_DOC_PATH), "utf8");
}

/** Opening fence of a worked-example block: ```yaml title="seed.yaml" */
const TITLED_FENCE = /^```[A-Za-z]*\s+title="([^"]+)"\s*$/;
const CLOSING_FENCE = /^```\s*$/;

/**
 * The complete example pack embedded in the doc, as a `PackFiles`: every fenced block tagged
 * `title="<pack file>"`, keyed by that name. `tests/generate/worldpack.test.ts` runs the result
 * through `parsePackFiles`, so the doc cannot claim an example that does not validate.
 */
export function examplePackFiles(doc: string): PackFiles {
  const files: PackFiles = {};
  const lines = doc.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const open = TITLED_FENCE.exec(lines[i]);
    if (!open) continue;
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length && !CLOSING_FENCE.test(lines[j]); j++) body.push(lines[j]);
    files[open[1]] = `${body.join("\n")}\n`;
    i = j;
  }
  return files;
}
