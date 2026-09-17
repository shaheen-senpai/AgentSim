// Edits to `pack.yaml` that touch only the node asked for, so comments and ordering survive (the
// `yaml` Document API) — the same approach as `scenarioEdits.ts`, for the World-level fields:
// its lifecycle status, the Mandates it declares, and the record of what built it.
// Pure and browser-safe; `tests/ui/packEdits.test.ts`.
import { parseDocument, Scalar, type Document } from "yaml";
import type { BuildInfo, PackStatus } from "@/engine/pack";

/** Serialise without re-wrapping: a one-line flow mapping stays on one line. */
const text = (doc: Document): string => doc.toString({ lineWidth: 0 });

/**
 * `parseDocument`, or `null` when the text is not parseable YAML — in which case every edit below
 * returns it untouched instead of throwing, and `parsePackFiles` reports the syntax error with its
 * line number, which is the only useful thing to do with it.
 *
 * `doc.toString()` on a Document carrying errors throws "Document with errors cannot be
 * stringified". That throw used to escape the generation retry loop in `src/generate/call.ts`
 * (which stamps `status: draft` through `withPackStatus` *before* validating), so one unparseable
 * scalar from the model killed the whole request and spent the operator's build token on nothing.
 */
function docOrNull(packYaml: string): Document | null {
  const doc = parseDocument(packYaml);
  return doc.errors.length > 0 ? null : doc;
}

/** A `|` block scalar with exactly one trailing newline — how the packs write prose. */
function blockScalar(doc: Document, value: string): Scalar {
  const node = doc.createNode(value.endsWith("\n") ? value : `${value}\n`) as Scalar;
  node.type = Scalar.BLOCK_LITERAL;
  return node;
}

/**
 * `pack.yaml` with its lifecycle status set. This is the whole of publishing: the engine refuses a
 * `ready` pack with no Scenarios, so the guard rides along with the write rather than being
 * re-checked here.
 */
export function withPackStatus(packYaml: string, status: PackStatus): string {
  const doc = docOrNull(packYaml);
  if (!doc) return packYaml;
  doc.set("status", status);
  return text(doc);
}

/** `pack.yaml` with the run that built it recorded. */
export function withBuiltBy(packYaml: string, info: BuildInfo): string {
  const doc = docOrNull(packYaml);
  if (!doc) return packYaml;
  doc.set("built_by", doc.createNode(info, { flow: false }));
  return text(doc);
}

/** `pack.yaml` with one Mandate's text replaced; a Mandate the pack does not declare is left alone. */
export function setMandateText(packYaml: string, id: string, value: string): string {
  const doc = docOrNull(packYaml);
  if (!doc) return packYaml;
  if (doc.getIn(["mandates", id]) === undefined) return packYaml;
  doc.setIn(["mandates", id, "text"], blockScalar(doc, value));
  return text(doc);
}
