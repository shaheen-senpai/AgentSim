// Edits to a Scenario's YAML file that touch only the node asked for, so comments and ordering
// survive (the `yaml` Document API). Pure and browser-safe; `tests/ui/scenarioEdits.test.ts`.
import { isSeq, parse, parseDocument, Scalar, type Document } from "yaml";

export type EditResult = { ok: true; file: string } | { ok: false; error: string };

/** Serialise without re-wrapping: a one-line flow mapping stays on one line, a long title is not folded. */
const text = (doc: Document): string => doc.toString({ lineWidth: 0 });

/** A `|` block scalar with exactly one trailing newline — how the packs write prose. */
function blockScalar(doc: Document, value: string): Scalar {
  const node = doc.createNode(value.endsWith("\n") ? value : `${value}\n`) as Scalar;
  node.type = Scalar.BLOCK_LITERAL;
  return node;
}

export function setTaskBrief(file: string, value: string): string {
  const doc = parseDocument(file);
  doc.set("task_brief", blockScalar(doc, value));
  return text(doc);
}

export function setPolicyText(file: string, value: string): string {
  const doc = parseDocument(file);
  doc.setIn(["policy", "text"], blockScalar(doc, value));
  return text(doc);
}

export function removeListItem(file: string, list: "attacks" | "checks", index: number): string {
  const doc = parseDocument(file);
  if (doc.getIn([list, index]) !== undefined) doc.deleteIn([list, index]);
  return text(doc);
}

const isMapping = (v: unknown): boolean => typeof v === "object" && v !== null && !Array.isArray(v);

/** `snippet` is one YAML mapping, or a sequence of them; each becomes a new item at the end of `list`. */
export function appendListItems(file: string, list: "attacks" | "checks", snippet: string): EditResult {
  let parsed: unknown;
  try {
    parsed = parse(snippet);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (items.length === 0 || !items.every(isMapping)) return { ok: false, error: "Paste one YAML mapping, or a list of them." };
  const doc = parseDocument(file);
  if (!isSeq(doc.get(list))) doc.set(list, doc.createNode([]));
  for (const item of items) doc.addIn([list], doc.createNode(item));
  return { ok: true, file: text(doc) };
}

/** A new Scenario with one `reads_scoped` Check on the pack's principal — valid against any pack. */
export function newScenarioFile(input: { id: string; title: string; taskBrief: string; policy: string; principal: string }): string {
  const doc = parseDocument(
    [
      `id: ${JSON.stringify(input.id)}`,
      `title: ${JSON.stringify(input.title)}`,
      "task_brief: |",
      "  x",
      "policy:",
      "  text: |",
      "    x",
      "checks:",
      `  - { type: reads_scoped, dimension: data_access, principal: ${JSON.stringify(input.principal)} }`,
      "attacks: []",
      "",
    ].join("\n"),
  );
  doc.set("task_brief", blockScalar(doc, input.taskBrief));
  doc.setIn(["policy", "text"], blockScalar(doc, input.policy));
  return text(doc);
}
