// The entity DSL executor: runs one `tools.yaml` declaration against a World, producing exactly
// the results and error messages of the old hand-written engine (src/sim/tools.ts, v0.1).
import { template, type Bindings } from "./expr";
import { fieldZod, inputZod, type ToolDef, type WorldPack } from "./pack";
import type { Change, Row, World } from "./types";
import { entityLabel, findRow, matchWhere, rowsOf } from "./world";

export class ToolError extends Error {}

export type ToolRun = { result: string; changes: Change[]; args: Record<string, unknown>; value: unknown };

type LookupSpec = { collection: string; id?: string; where?: Record<string, unknown> };
type IncludeSpec = { collection: string; where: Record<string, unknown>; order_by?: string };

/** The entity's label, lowercased, for the "No <label> <id>" / "produced an invalid <label>" messages. */
function lowerLabel(pack: WorldPack, collection: string): string {
  return entityLabel(pack, collection).toLowerCase();
}

/** `template(value, bindings)`, coerced to a string (ids and guard errors are always meant to be strings). */
function templateString(value: string, bindings: Bindings): string {
  const v = template(value, bindings);
  return typeof v === "string" ? v : String(v);
}

/** Ascending sort by a field's string value; does not mutate `rows`. */
function sortByField(rows: Row[], field: string): Row[] {
  return [...rows].sort((a, b) => String(a[field]).localeCompare(String(b[field])));
}

/** Rows of `collection` matching a templated `where`, sorted by `order_by` when given. */
function matchingRows(pack: WorldPack, w: World, collection: string, where: Record<string, unknown>, orderBy: string | undefined, bindings: Bindings): Row[] {
  const templated = template(where, bindings) as Record<string, unknown>;
  const rows = rowsOf(w, collection).filter((r) => matchWhere(pack, w, r, templated));
  return orderBy ? sortByField(rows, orderBy) : rows;
}

/** Evaluates `tool.lookup` entries in declaration order, binding each under its key. */
function runLookups(pack: WorldPack, w: World, tool: ToolDef, bindings: Bindings): void {
  for (const [key, spec] of Object.entries(tool.lookup ?? {}) as [string, LookupSpec][]) {
    if (spec.id !== undefined) {
      const id = templateString(spec.id, bindings);
      const row = findRow(w, spec.collection, id);
      if (!row) throw new ToolError(`No ${lowerLabel(pack, spec.collection)} ${id}`);
      bindings[key] = structuredClone(row);
    } else {
      const where = template(spec.where ?? {}, bindings) as Record<string, unknown>;
      const rows = rowsOf(w, spec.collection).filter((r) => matchWhere(pack, w, r, where));
      bindings[key] = structuredClone(rows);
    }
  }
}

/** Guards in declaration order; the first truthy `when` throws its templated `error`. */
function runGuards(tool: ToolDef, bindings: Bindings): void {
  for (const guard of tool.guards ?? []) {
    if (template(guard.when, bindings)) throw new ToolError(templateString(guard.error, bindings));
  }
}

/** `{ key: rows }` for each `include` entry, resolved against `bindings` (already carrying `entity` or `item`). */
function runIncludes(pack: WorldPack, w: World, tool: ToolDef, bindings: Bindings): Record<string, Row[]> {
  const includes: Record<string, Row[]> = {};
  for (const [key, spec] of Object.entries(tool.include ?? {}) as [string, IncludeSpec][]) {
    includes[key] = structuredClone(matchingRows(pack, w, spec.collection, spec.where, spec.order_by, bindings));
  }
  return includes;
}

/**
 * New id for a `create`: `prefix + String((start ?? 1) + rowCount).padStart(width ?? 0, "0")`.
 *
 * Counting rows means a Seed whose ids are not contiguous from `start` can mint one that already
 * exists — `runCreate` refuses it rather than pushing a duplicate, which `newRows()` would then
 * miss (it diffs by id set) and an `entity_created` Check would fail for a reason nothing explains.
 */
function nextId(tool: ToolDef, rowCount: number): string {
  const spec = tool.new_id!;
  const n = (spec.start ?? 1) + rowCount;
  return spec.prefix + String(n).padStart(spec.width ?? 0, "0");
}

/**
 * Validates a create/update row against its entity's declared fields (applying defaults via
 * `fieldZod`'s own `.default()`/`.optional()` wrapping); throws on the row's first invalid field.
 */
function validateRow(pack: WorldPack, tool: ToolDef, collection: string, row: Row): void {
  const entity = pack.meta.entities[collection];
  if (!entity) return;
  for (const [field, spec] of Object.entries(entity.fields)) {
    const parsed = fieldZod(spec).safeParse(row[field]);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? parsed.error.message;
      throw new ToolError(`${tool.name} produced an invalid ${lowerLabel(pack, collection)}: ${message}`);
    }
    row[field] = parsed.data;
  }
}

type OpResult = { value: unknown; changes: Change[] };

function runGet(pack: WorldPack, w: World, tool: ToolDef, bindings: Bindings): OpResult {
  const id = templateString(tool.id!, bindings);
  const row = findRow(w, tool.collection, id);
  if (!row) throw new ToolError(`No ${lowerLabel(pack, tool.collection)} ${id}`);
  bindings.entity = structuredClone(row);
  const includes = runIncludes(pack, w, tool, bindings);
  return { value: { ...(bindings.entity as Row), ...includes }, changes: [] };
}

function runList(pack: WorldPack, w: World, tool: ToolDef, bindings: Bindings): OpResult {
  const rows = matchingRows(pack, w, tool.collection, tool.where ?? {}, tool.order_by, bindings);
  const value = rows.map((row) => {
    const itemBindings: Bindings = { ...bindings, item: structuredClone(row) };
    const includes = runIncludes(pack, w, tool, itemBindings);
    return { ...(itemBindings.item as Row), ...includes };
  });
  return { value, changes: [] };
}

function runCreate(pack: WorldPack, w: World, tool: ToolDef, bindings: Bindings): OpResult {
  const rows = rowsOf(w, tool.collection);
  const id = nextId(tool, rows.length);
  if (findRow(w, tool.collection, id)) throw new ToolError(`${tool.name} would create a duplicate ${lowerLabel(pack, tool.collection)} id ${id}`);
  const set = template(tool.set ?? {}, bindings) as Record<string, unknown>;
  const row: Row = { id, ...set };
  validateRow(pack, tool, tool.collection, row);
  if (!w.collections[tool.collection]) w.collections[tool.collection] = [];
  w.collections[tool.collection].push(row);
  bindings.entity = structuredClone(row);
  const includes = runIncludes(pack, w, tool, bindings);
  return { value: { ...(bindings.entity as Row), ...includes }, changes: [{ collection: tool.collection, id, op: "create" }] };
}

function runUpdate(pack: WorldPack, w: World, tool: ToolDef, bindings: Bindings): OpResult {
  const id = templateString(tool.id!, bindings);
  const row = findRow(w, tool.collection, id);
  if (!row) throw new ToolError(`No ${lowerLabel(pack, tool.collection)} ${id}`);
  const preBindings: Bindings = { ...bindings, entity: structuredClone(row) };
  const set = template(tool.set ?? {}, preBindings) as Record<string, unknown>;
  Object.assign(row, set);
  validateRow(pack, tool, tool.collection, row);
  bindings.entity = structuredClone(row);
  const includes = runIncludes(pack, w, tool, bindings);
  return { value: { ...(bindings.entity as Row), ...includes }, changes: [{ collection: tool.collection, id, op: "update" }] };
}

/** Runs one declared tool against `w`, mutating it for writes. Throws `ToolError` for every failure mode. */
export function runTool(pack: WorldPack, w: World, name: string, input: unknown): ToolRun {
  const tool = pack.tools[name];
  if (!tool) throw new ToolError(`Unknown tool ${name}`);

  const parsed = inputZod(tool).safeParse(input ?? {});
  if (!parsed.success) throw new ToolError(`Invalid arguments for ${name}: ${parsed.error.message}`);
  const args = parsed.data as Record<string, unknown>;

  const bindings: Bindings = { input: args, now: w.now, currency: w.currency };
  runLookups(pack, w, tool, bindings);
  runGuards(tool, bindings);

  const { value: defaultValue, changes } =
    tool.op === "get" ? runGet(pack, w, tool, bindings) :
    tool.op === "list" ? runList(pack, w, tool, bindings) :
    tool.op === "create" ? runCreate(pack, w, tool, bindings) :
    runUpdate(pack, w, tool, bindings);

  const value = tool.returns !== undefined ? template(tool.returns, bindings) : defaultValue;
  return { result: JSON.stringify(value), changes, args, value };
}

/**
 * The entity a tool call targets, for the `owner_is`/`reads_scoped` Checks. No World is involved:
 * `subject.id` templates only ever reference `input.*`, so bindings carry just `input`.
 */
export function toolSubject(_pack: WorldPack, tool: ToolDef, args: Record<string, unknown>): { collection: string; id: string } | null {
  const id = template(tool.subject.id, { input: args });
  return typeof id === "string" ? { collection: tool.subject.collection, id } : null;
}
