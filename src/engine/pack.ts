// World pack format: zod schemas, semantic validation, loading and saving.
//
// A World pack lives under `worldpacks/<packId>/` (or `AGENTSIM_PACKS_DIR`):
//   pack.yaml            id, name, domain, description, principal, systems, entities
//   seed.yaml            now, currency, rows: { <collection>: Row[] }
//   tools.yaml           <toolName>: ToolDef
//   scenarios/<id>.yaml  Scenario
//   agents/<version>.md  optional Reference Agent prompts
//
// This is the one engine file allowed to touch the filesystem.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYAMLText } from "yaml";
import { z } from "zod";
import { DIMENSIONS, type Dimension } from "./dimensions";
import { evaluate, isTemplate } from "./expr";
import type { Row } from "./types";

export type { Dimension };

// ───────────────────────────── Types (pack.yaml) ─────────────────────────────

export type FieldType = "string" | "text" | "int" | "number" | "boolean" | "string[]" | "enum";

export type FieldSpec = {
  type: FieldType;
  ref?: string;
  values?: string[];
  default?: unknown;
  optional?: boolean;
  untrusted?: boolean;
  min?: number;
  max?: number;
};

export type EntitySpec = {
  label: string;
  id_prefix?: string;
  owner: "self" | { via: string };
  fields: Record<string, FieldSpec>;
};

export type PackMeta = {
  id: string;
  name: string;
  domain: string;
  description: string;
  principal: string;
  systems: Record<string, { label: string }>;
  entities: Record<string, EntitySpec>;
};

// ───────────────────────────── Types (seed.yaml) ─────────────────────────────

export type SeedFile = { now: string; currency: string; rows: Record<string, Row[]> };

// ───────────────────────────── Types (tools.yaml) ─────────────────────────────

export type ToolDef = {
  name: string;
  system: string;
  kind: "read" | "write";
  description: string;
  input: Record<string, FieldSpec>;
  subject: { collection: string; id: string };
  lookup?: Record<string, { collection: string; id?: string; where?: Record<string, unknown> }>;
  guards?: { when: string; error: string }[];
  op: "get" | "list" | "create" | "update";
  collection: string;
  id?: string;
  where?: Record<string, unknown>;
  order_by?: string;
  include?: Record<string, { collection: string; where: Record<string, unknown>; order_by?: string }>;
  new_id?: { prefix: string; start?: number; width?: number };
  set?: Record<string, unknown>;
  returns?: unknown;
};

// ───────────────────────────── Types (scenarios/*.yaml) ─────────────────────────────

export type Check =
  | { type: "entity_created"; dimension: Dimension; collection: string; where: Record<string, unknown>; count?: number }
  | { type: "entity_count"; dimension: Dimension; collection: string; where?: Record<string, unknown>; created?: boolean; equals: number }
  | { type: "field_equals"; dimension: Dimension; collection: string; id: string; field: string; value: unknown }
  | { type: "modified_only"; dimension: Dimension; collection: string; ids: string[] }
  | { type: "arg_lte"; dimension: Dimension; tool: string; arg: string; max: number }
  | { type: "arg_in"; dimension: Dimension; tool: string; arg: string; values: unknown[] }
  | { type: "owner_is"; dimension: Dimension; tool: string; principal: string }
  | { type: "reads_scoped"; dimension: Dimension; principal: string }
  | { type: "tool_not_called"; dimension: Dimension; tool: string; args_match?: Record<string, unknown> }
  | { type: "lure_not_taken"; dimension: Dimension; attackId?: string };

export type Lure = { tool: string; args_match: Record<string, unknown> };

export type Mutation =
  | { type: "append_to_field"; collection: string; id: string; field: string; text: string }
  | { type: "set_field"; collection: string; id: string; field: string; value: unknown }
  | { type: "insert_row"; collection: string; row: Row };

export type Attack = { id: string; title: string; mutation: Mutation; lure: Lure };

export type Scenario = { id: string; title: string; task_brief: string; policy: { text: string }; checks: Check[]; attacks: Attack[] };

// ───────────────────────────── Top-level pack ─────────────────────────────

export type WorldPack = {
  meta: PackMeta;
  seed: SeedFile;
  tools: Record<string, ToolDef>;
  scenarios: Scenario[];
  agents: Record<string, string>;
  files: Record<string, string>;
};

export type PackFiles = Record<string, string>; // "pack.yaml" | "seed.yaml" | "tools.yaml" | "scenarios/<id>.yaml" | "agents/<v>.md" → text

export type ValidationError = { file: string; path: string; message: string };

// ══════════════════════════════════════════════════════════════════════════
// Zod schemas — raw structural parsing
// ══════════════════════════════════════════════════════════════════════════

const FIELD_TYPES = ["string", "text", "int", "number", "boolean", "string[]", "enum"] as const;

/** Field spec: shorthand `name: <type>` or `{ type, ref?, values?, default?, optional?, untrusted?, min?, max? }`. */
const FieldSpecSchema = z.preprocess(
  (v) => (typeof v === "string" ? { type: v } : v),
  z.object({
    type: z.enum(FIELD_TYPES),
    ref: z.string().optional(),
    values: z.array(z.string()).optional(),
    default: z.unknown().optional(),
    optional: z.boolean().optional(),
    untrusted: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }).strict(),
) as z.ZodType<FieldSpec>;

const EntitySpecSchema = z.object({
  label: z.string().optional(),
  id_prefix: z.string().optional(),
  owner: z.union([z.literal("self"), z.object({ via: z.string() }).strict()]),
  fields: z.record(z.string(), FieldSpecSchema),
}).strict();

const PackMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  description: z.string(),
  principal: z.string(),
  systems: z.record(z.string(), z.object({ label: z.string() }).strict()),
  entities: z.record(z.string(), EntitySpecSchema),
}).strict();

const RowSchema = z.object({ id: z.string() }).catchall(z.unknown()) as z.ZodType<Row>;

const SeedFileSchema = z.object({
  now: z.string(),
  currency: z.string(),
  rows: z.record(z.string(), z.array(RowSchema)),
}).strict();

const LookupSpecSchema = z.object({
  collection: z.string(),
  id: z.string().optional(),
  where: z.record(z.string(), z.unknown()).optional(),
}).strict();

const IncludeSpecSchema = z.object({
  collection: z.string(),
  where: z.record(z.string(), z.unknown()),
  order_by: z.string().optional(),
}).strict();

const GuardSchema = z.object({ when: z.string(), error: z.string() }).strict();

const NewIdSchema = z.object({ prefix: z.string(), start: z.number().optional(), width: z.number().optional() }).strict();

const ToolDefSchema = z.object({
  system: z.string(),
  kind: z.enum(["read", "write"]),
  description: z.string(),
  input: z.record(z.string(), FieldSpecSchema),
  subject: z.object({ collection: z.string(), id: z.string() }).strict(),
  lookup: z.record(z.string(), LookupSpecSchema).optional(),
  guards: z.array(GuardSchema).optional(),
  op: z.enum(["get", "list", "create", "update"]),
  collection: z.string(),
  id: z.string().optional(),
  where: z.record(z.string(), z.unknown()).optional(),
  order_by: z.string().optional(),
  include: z.record(z.string(), IncludeSpecSchema).optional(),
  new_id: NewIdSchema.optional(),
  set: z.record(z.string(), z.unknown()).optional(),
  returns: z.unknown().optional(),
}).strict();

const ToolsFileSchema = z.record(z.string(), ToolDefSchema);

const DimensionSchema = z.enum(DIMENSIONS);

const CheckSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("entity_created"), dimension: DimensionSchema, collection: z.string(), where: z.record(z.string(), z.unknown()), count: z.number().optional() }).strict(),
  z.object({ type: z.literal("entity_count"), dimension: DimensionSchema, collection: z.string(), where: z.record(z.string(), z.unknown()).optional(), created: z.boolean().optional(), equals: z.number() }).strict(),
  z.object({ type: z.literal("field_equals"), dimension: DimensionSchema, collection: z.string(), id: z.string(), field: z.string(), value: z.unknown() }).strict(),
  z.object({ type: z.literal("modified_only"), dimension: DimensionSchema, collection: z.string(), ids: z.array(z.string()) }).strict(),
  z.object({ type: z.literal("arg_lte"), dimension: DimensionSchema, tool: z.string(), arg: z.string(), max: z.number() }).strict(),
  z.object({ type: z.literal("arg_in"), dimension: DimensionSchema, tool: z.string(), arg: z.string(), values: z.array(z.unknown()) }).strict(),
  z.object({ type: z.literal("owner_is"), dimension: DimensionSchema, tool: z.string(), principal: z.string() }).strict(),
  z.object({ type: z.literal("reads_scoped"), dimension: DimensionSchema, principal: z.string() }).strict(),
  z.object({ type: z.literal("tool_not_called"), dimension: DimensionSchema, tool: z.string(), args_match: z.record(z.string(), z.unknown()).optional() }).strict(),
  z.object({ type: z.literal("lure_not_taken"), dimension: DimensionSchema, attackId: z.string().optional() }).strict(),
]) as z.ZodType<Check>;

const LureSchema = z.object({ tool: z.string(), args_match: z.record(z.string(), z.unknown()) }).strict();

const MutationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("append_to_field"), collection: z.string(), id: z.string(), field: z.string(), text: z.string() }).strict(),
  z.object({ type: z.literal("set_field"), collection: z.string(), id: z.string(), field: z.string(), value: z.unknown() }).strict(),
  z.object({ type: z.literal("insert_row"), collection: z.string(), row: RowSchema }).strict(),
]) as z.ZodType<Mutation>;

const AttackSchema = z.object({ id: z.string(), title: z.string(), mutation: MutationSchema, lure: LureSchema }).strict();

const ScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  task_brief: z.string(),
  policy: z.object({ text: z.string() }).strict(),
  checks: z.array(CheckSchema),
  attacks: z.array(AttackSchema),
}).strict();

// ══════════════════════════════════════════════════════════════════════════
// Semantic validation
// ══════════════════════════════════════════════════════════════════════════

function capitalizeSingular(collection: string): string {
  const singular = collection.endsWith("s") ? collection.slice(0, -1) : collection;
  return singular.length ? singular[0].toUpperCase() + singular.slice(1) : singular;
}

function fillEntityLabels(raw: z.infer<typeof PackMetaSchema>): PackMeta {
  const entities: Record<string, EntitySpec> = {};
  for (const [key, entity] of Object.entries(raw.entities)) {
    entities[key] = { ...entity, label: entity.label ?? capitalizeSingular(key) } as EntitySpec;
  }
  return { ...raw, entities };
}

/** Recursively parses every `${...}` template found in `value`, reporting expressions that fail to parse/evaluate. */
function checkTemplatesDeep(file: string, path_: string, value: unknown, errors: ValidationError[]): void {
  if (typeof value === "string") {
    if (!isTemplate(value)) return;
    for (const m of value.match(/\$\{([^}]*)\}/g) ?? []) {
      const inner = m.slice(2, -1);
      try {
        evaluate(inner, {});
      } catch (e) {
        errors.push({ file, path: path_, message: e instanceof Error ? e.message : String(e) });
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => checkTemplatesDeep(file, `${path_}[${i}]`, v, errors));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) checkTemplatesDeep(file, `${path_}.${k}`, v, errors);
  }
}

/** Follows `owner.via` from `start` until a `self` entity, verifying it is `principal` within `entities.length` hops. */
function resolveOwnerChain(entities: Record<string, EntitySpec>, start: string, principal: string, errors: ValidationError[]): void {
  let cur = start;
  const limit = Object.keys(entities).length;
  for (let hops = 0; hops <= limit; hops++) {
    const ent = entities[cur];
    if (!ent) {
      errors.push({ file: "pack.yaml", path: `entities.${start}.owner`, message: "ownership does not resolve to the principal (cycle?)" });
      return;
    }
    if (ent.owner === "self") {
      if (cur !== principal) {
        errors.push({ file: "pack.yaml", path: `entities.${start}.owner`, message: `ownership of '${start}' resolves to '${cur}', not the principal '${principal}'` });
      }
      return;
    }
    if (hops === limit) {
      errors.push({ file: "pack.yaml", path: `entities.${start}.owner`, message: "ownership does not resolve to the principal (cycle?)" });
      return;
    }
    const via = ent.owner.via;
    const field = ent.fields[via];
    if (!field || !field.ref) {
      errors.push({ file: "pack.yaml", path: `entities.${cur}.owner.via`, message: `ownership via '${via}' on '${cur}' does not name a field with a ref` });
      return;
    }
    cur = field.ref;
  }
}

/** `where` keys resolve hop-by-hop through `ref` fields (e.g. `payment_id.order_id`); `$owner` is always allowed. */
function resolveWhereKey(entities: Record<string, EntitySpec>, collection: string, key: string): string | null {
  if (key === "$owner") return null;
  const parts = key.split(".");
  let cur = collection;
  for (let i = 0; i < parts.length; i++) {
    const ent = entities[cur];
    if (!ent) return `unknown collection '${cur}' while resolving where key '${key}'`;
    const field = ent.fields[parts[i]];
    if (!field) return `field '${parts[i]}' is not declared on '${cur}' (where key '${key}')`;
    if (i < parts.length - 1) {
      if (!field.ref) return `field '${parts[i]}' on '${cur}' is not a ref (where key '${key}')`;
      cur = field.ref;
    }
  }
  return null;
}

function validateEntities(meta: PackMeta, errors: ValidationError[]): void {
  const entities = meta.entities;
  const principalEntity = entities[meta.principal];
  if (!principalEntity) {
    errors.push({ file: "pack.yaml", path: "principal", message: `principal '${meta.principal}' is not a declared entity` });
  } else if (principalEntity.owner !== "self") {
    errors.push({ file: "pack.yaml", path: `entities.${meta.principal}.owner`, message: `principal '${meta.principal}' must have owner: self (ownership)` });
  }

  for (const [ek, entity] of Object.entries(entities)) {
    for (const [fk, field] of Object.entries(entity.fields)) {
      if (field.ref && !entities[field.ref]) {
        errors.push({ file: "pack.yaml", path: `entities.${ek}.fields.${fk}.ref`, message: `ref '${field.ref}' is not a declared entity` });
      }
    }
  }

  for (const ek of Object.keys(entities)) resolveOwnerChain(entities, ek, meta.principal, errors);
}

function validateSeed(meta: PackMeta, seed: SeedFile, errors: ValidationError[]): void {
  const entities = meta.entities;
  for (const ek of Object.keys(entities)) {
    if (!(ek in seed.rows)) errors.push({ file: "seed.yaml", path: `rows.${ek}`, message: `missing rows for collection '${ek}'` });
  }

  for (const [ek, rows] of Object.entries(seed.rows)) {
    const entity = entities[ek];
    if (!entity) {
      errors.push({ file: "seed.yaml", path: `rows.${ek}`, message: `collection '${ek}' is not a declared entity` });
      continue;
    }
    rows.forEach((row, i) => {
      const rowPath = `rows.${ek}[${i}]`;
      if (entity.id_prefix && !row.id.startsWith(entity.id_prefix)) {
        errors.push({ file: "seed.yaml", path: `${rowPath}.id`, message: `row ${row.id} in ${ek} must start with ${entity.id_prefix}` });
      }
      for (const key of Object.keys(row)) {
        if (!(key in entity.fields)) errors.push({ file: "seed.yaml", path: `${rowPath}.${key}`, message: `unknown field '${key}' on row ${row.id} in ${ek}` });
      }
      for (const [fk, spec] of Object.entries(entity.fields)) {
        let value: unknown = row[fk];
        if (value === undefined) {
          if (spec.default !== undefined) {
            value = spec.default;
            row[fk] = spec.default;
          } else if (spec.optional) {
            continue;
          } else {
            errors.push({ file: "seed.yaml", path: `${rowPath}.${fk}`, message: `row ${row.id} in ${ek} is missing required field '${fk}'` });
            continue;
          }
        }
        const parsed = fieldZod(spec).safeParse(value);
        if (!parsed.success) {
          errors.push({ file: "seed.yaml", path: `${rowPath}.${fk}`, message: `field '${fk}' on row ${row.id} in ${ek}: ${JSON.stringify(value)} ${parsed.error.issues[0]?.message ?? "is invalid"}` });
          continue;
        }
        if (spec.ref && typeof parsed.data === "string") {
          const refRows = seed.rows[spec.ref] ?? [];
          if (!refRows.some((r) => r.id === parsed.data)) {
            errors.push({ file: "seed.yaml", path: `${rowPath}.${fk}`, message: `field '${fk}' on row ${row.id} in ${ek} references unknown ${spec.ref} row '${parsed.data}'` });
          }
        }
      }
    });
  }
}

function validateTools(meta: PackMeta, tools: Record<string, ToolDef>, errors: ValidationError[]): void {
  const entities = meta.entities;
  for (const [tname, tool] of Object.entries(tools)) {
    const tpath = `tools.${tname}`;
    if (!(tool.system in meta.systems)) {
      errors.push({ file: "tools.yaml", path: `${tpath}.system`, message: `system '${tool.system}' is not declared in pack.yaml systems` });
    }

    const collections: [string, string][] = [[tool.collection, `${tpath}.collection`], [tool.subject.collection, `${tpath}.subject.collection`]];
    if (tool.lookup) for (const [lk, l] of Object.entries(tool.lookup)) collections.push([l.collection, `${tpath}.lookup.${lk}.collection`]);
    if (tool.include) for (const [ik, inc] of Object.entries(tool.include)) collections.push([inc.collection, `${tpath}.include.${ik}.collection`]);
    for (const [c, p] of collections) {
      if (!(c in entities)) errors.push({ file: "tools.yaml", path: p, message: `collection '${c}' is not a declared entity` });
    }

    if ((tool.op === "get" || tool.op === "update") && !tool.id) {
      errors.push({ file: "tools.yaml", path: `${tpath}.id`, message: `op '${tool.op}' requires 'id'` });
    }
    if (tool.op === "create" && (!tool.new_id || !tool.set)) {
      errors.push({ file: "tools.yaml", path: tpath, message: "op 'create' requires 'new_id' and 'set'" });
    }

    checkTemplatesDeep("tools.yaml", tpath, tool, errors);
  }
}

function validateScenario(file: string, s: Scenario, meta: PackMeta, seed: SeedFile, tools: Record<string, ToolDef>, errors: ValidationError[]): void {
  const entities = meta.entities;

  const checkCollection = (c: string, p: string): void => {
    if (!(c in entities)) errors.push({ file, path: p, message: `collection '${c}' is not a declared entity` });
  };
  const idExists = (collection: string, id: string, p: string): void => {
    const rows = seed.rows[collection] ?? [];
    if (!rows.some((r) => r.id === id)) errors.push({ file, path: p, message: `id '${id}' does not exist in seed rows for '${collection}'` });
  };
  const toolExists = (tool: string, p: string): ToolDef | undefined => {
    const t = tools[tool];
    if (!t) errors.push({ file, path: p, message: `tool '${tool}' is not declared in tools.yaml` });
    return t;
  };
  const argExists = (t: ToolDef | undefined, arg: string, p: string): void => {
    if (t && !(arg in t.input)) errors.push({ file, path: p, message: `arg '${arg}' is not an input field of tool '${t.name}'` });
  };
  const checkWhere = (collection: string, where: Record<string, unknown>, p: string): void => {
    for (const key of Object.keys(where)) {
      const err = resolveWhereKey(entities, collection, key);
      if (err) errors.push({ file, path: `${p}.${key}`, message: err });
    }
  };

  s.checks.forEach((c, i) => {
    const p = `checks[${i}]`;
    switch (c.type) {
      case "entity_created":
        checkCollection(c.collection, `${p}.collection`);
        checkWhere(c.collection, c.where, `${p}.where`);
        break;
      case "entity_count":
        checkCollection(c.collection, `${p}.collection`);
        if (c.where) checkWhere(c.collection, c.where, `${p}.where`);
        break;
      case "field_equals": {
        checkCollection(c.collection, `${p}.collection`);
        idExists(c.collection, c.id, `${p}.id`);
        const ent = entities[c.collection];
        if (ent && !(c.field in ent.fields)) errors.push({ file, path: `${p}.field`, message: `field '${c.field}' is not declared on '${c.collection}'` });
        break;
      }
      case "modified_only":
        checkCollection(c.collection, `${p}.collection`);
        c.ids.forEach((id, j) => idExists(c.collection, id, `${p}.ids[${j}]`));
        break;
      case "arg_lte":
      case "arg_in": {
        const t = toolExists(c.tool, `${p}.tool`);
        argExists(t, c.arg, `${p}.arg`);
        break;
      }
      case "owner_is":
      case "tool_not_called":
        toolExists(c.tool, `${p}.tool`);
        break;
      case "reads_scoped":
      case "lure_not_taken":
        break;
    }
  });

  s.attacks.forEach((a, i) => {
    const p = `attacks[${i}]`;
    const m = a.mutation;
    checkCollection(m.collection, `${p}.mutation.collection`);
    if (m.type === "append_to_field" || m.type === "set_field") {
      idExists(m.collection, m.id, `${p}.mutation.id`);
      const ent = entities[m.collection];
      const field = ent?.fields[m.field];
      if (ent && !field) {
        errors.push({ file, path: `${p}.mutation.field`, message: `field '${m.field}' is not declared on '${m.collection}'` });
      } else if (ent && field && m.type === "append_to_field" && field.type !== "string" && field.type !== "text") {
        errors.push({ file, path: `${p}.mutation.field`, message: `append_to_field requires a string/text field; '${m.field}' on '${m.collection}' is '${field.type}'` });
      }
    }
    toolExists(a.lure.tool, `${p}.lure.tool`);
  });
}

// ══════════════════════════════════════════════════════════════════════════
// YAML parsing
// ══════════════════════════════════════════════════════════════════════════

function parseYamlFile(file: string, text: string): { data: unknown; errors: ValidationError[] } {
  try {
    return { data: parseYAMLText(text), errors: [] };
  } catch (e) {
    return { data: undefined, errors: [{ file, path: "", message: e instanceof Error ? e.message : String(e) }] };
  }
}

function zodIssues(file: string, error: z.ZodError): ValidationError[] {
  return error.issues.map((issue) => ({ file, path: issue.path.map(String).join("."), message: issue.message }));
}

/**
 * Parses and validates a set of pack files (as produced by `loadPack` or an editor draft).
 * Never throws; collects every problem found across all files.
 */
export function parsePackFiles(files: PackFiles): { pack: WorldPack | null; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  const packRaw = parseYamlFile("pack.yaml", files["pack.yaml"] ?? "");
  errors.push(...packRaw.errors);
  let meta: PackMeta | null = null;
  if (packRaw.errors.length === 0) {
    const r = PackMetaSchema.safeParse(packRaw.data);
    if (!r.success) errors.push(...zodIssues("pack.yaml", r.error));
    else meta = fillEntityLabels(r.data);
  }

  const seedRaw = parseYamlFile("seed.yaml", files["seed.yaml"] ?? "");
  errors.push(...seedRaw.errors);
  let seed: SeedFile | null = null;
  if (seedRaw.errors.length === 0) {
    const r = SeedFileSchema.safeParse(seedRaw.data);
    if (!r.success) errors.push(...zodIssues("seed.yaml", r.error));
    else seed = r.data;
  }

  const toolsRaw = parseYamlFile("tools.yaml", files["tools.yaml"] ?? "");
  errors.push(...toolsRaw.errors);
  let tools: Record<string, ToolDef> | null = null;
  if (toolsRaw.errors.length === 0) {
    const r = ToolsFileSchema.safeParse(toolsRaw.data);
    if (!r.success) errors.push(...zodIssues("tools.yaml", r.error));
    else tools = Object.fromEntries(Object.entries(r.data).map(([name, t]) => [name, { name, ...t }]));
  }

  const scenarioFileNames = Object.keys(files).filter((f) => f.startsWith("scenarios/") && f.endsWith(".yaml"));
  const scenarioEntries: { file: string; scenario: Scenario }[] = [];
  for (const f of scenarioFileNames) {
    const raw = parseYamlFile(f, files[f]);
    errors.push(...raw.errors);
    if (raw.errors.length) continue;
    const r = ScenarioSchema.safeParse(raw.data);
    if (!r.success) {
      errors.push(...zodIssues(f, r.error));
      continue;
    }
    scenarioEntries.push({ file: f, scenario: r.data });
  }
  scenarioEntries.sort((a, b) => a.scenario.id.localeCompare(b.scenario.id));

  const agents: Record<string, string> = {};
  for (const f of Object.keys(files)) {
    if (f.startsWith("agents/") && f.endsWith(".md")) agents[path.basename(f, ".md")] = files[f];
  }

  if (!meta || !seed || !tools) {
    return { pack: null, errors };
  }

  validateEntities(meta, errors);
  validateSeed(meta, seed, errors);
  validateTools(meta, tools, errors);
  for (const { file, scenario } of scenarioEntries) validateScenario(file, scenario, meta, seed, tools, errors);

  if (errors.length > 0) return { pack: null, errors };

  const pack: WorldPack = { meta, seed, tools, scenarios: scenarioEntries.map((e) => e.scenario), agents, files };
  return { pack, errors: [] };
}

// ══════════════════════════════════════════════════════════════════════════
// Loading / saving
// ══════════════════════════════════════════════════════════════════════════

export function packsDir(): string {
  return process.env.AGENTSIM_PACKS_DIR ?? path.join(process.cwd(), "worldpacks");
}

export function listPackIds(): string[] {
  const dir = packsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function readPackFiles(dir: string): PackFiles {
  const files: PackFiles = {};
  for (const rel of ["pack.yaml", "seed.yaml", "tools.yaml"]) {
    const p = path.join(dir, rel);
    if (existsSync(p)) files[rel] = readFileSync(p, "utf8");
  }
  const scenariosDir = path.join(dir, "scenarios");
  if (existsSync(scenariosDir)) {
    for (const f of readdirSync(scenariosDir)) {
      if (f.endsWith(".yaml")) files[`scenarios/${f}`] = readFileSync(path.join(scenariosDir, f), "utf8");
    }
  }
  const agentsDir = path.join(dir, "agents");
  if (existsSync(agentsDir)) {
    for (const f of readdirSync(agentsDir)) {
      if (f.endsWith(".md")) files[`agents/${f}`] = readFileSync(path.join(agentsDir, f), "utf8");
    }
  }
  return files;
}

/** Loads and validates a pack by id; throws one Error joining every validation message when invalid. */
export function loadPack(id: string): WorldPack {
  const dir = path.join(packsDir(), id);
  const files = readPackFiles(dir);
  const { pack, errors } = parsePackFiles(files);
  if (!pack) throw new Error(errors.map((e) => `${e.file}:${e.path} ${e.message}`).join("\n"));
  return pack;
}

const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

/** Writes pack files atomically (tmp + rename); deletes scenario/agent files no longer present. */
export function savePack(id: string, files: PackFiles): void {
  if (!PACK_ID_RE.test(id)) throw new Error(`Invalid pack id '${id}'`);
  const dir = path.join(packsDir(), id);
  mkdirSync(dir, { recursive: true });
  mkdirSync(path.join(dir, "scenarios"), { recursive: true });
  mkdirSync(path.join(dir, "agents"), { recursive: true });

  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    const tmp = `${full}.tmp`;
    writeFileSync(tmp, content, "utf8");
    renameSync(tmp, full);
  }

  const scenariosDir = path.join(dir, "scenarios");
  for (const f of readdirSync(scenariosDir)) {
    if (f.endsWith(".yaml") && !(`scenarios/${f}` in files)) rmSync(path.join(scenariosDir, f));
  }
  const agentsDir = path.join(dir, "agents");
  for (const f of readdirSync(agentsDir)) {
    if (f.endsWith(".md") && !(`agents/${f}` in files)) rmSync(path.join(agentsDir, f));
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Tool schemas
// ══════════════════════════════════════════════════════════════════════════

/** Builds the zod validator for one field spec (entity field or tool input field). */
export function fieldZod(spec: FieldSpec): z.ZodTypeAny {
  let base: z.ZodTypeAny;
  switch (spec.type) {
    case "string":
    case "text":
      base = z.string();
      break;
    case "int": {
      let n = z.number().int();
      if (spec.min !== undefined) n = n.min(spec.min);
      if (spec.max !== undefined) n = n.max(spec.max);
      base = n;
      break;
    }
    case "number": {
      let n = z.number();
      if (spec.min !== undefined) n = n.min(spec.min);
      if (spec.max !== undefined) n = n.max(spec.max);
      base = n;
      break;
    }
    case "boolean":
      base = z.boolean();
      break;
    case "string[]":
      base = z.array(z.string());
      break;
    case "enum":
      base = z.enum((spec.values ?? []) as [string, ...string[]]);
      break;
    default:
      base = z.unknown();
  }
  if (spec.default !== undefined) base = base.default(spec.default as never);
  if (spec.optional) base = base.optional();
  return base;
}

/** Builds a zod object schema for a tool's `input` fields. */
export function inputZod(tool: ToolDef): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, spec] of Object.entries(tool.input)) shape[key] = fieldZod(spec);
  return z.object(shape);
}

/** JSON Schema for a tool's input, for MCP `inputSchema` and similar consumers. */
export function inputJsonSchema(tool: ToolDef): Record<string, unknown> {
  return z.toJSONSchema(inputZod(tool)) as Record<string, unknown>;
}

/** The Task Brief text handed to an agent: the scenario's brief plus its policy. */
export function buildTaskBrief(s: Scenario): string {
  return `${s.task_brief.trim()}\n\nPolicy:\n${s.policy.text.trim()}`;
}
