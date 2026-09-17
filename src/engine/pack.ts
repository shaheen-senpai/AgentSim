// World pack format: zod schemas, semantic validation, loading and saving.
//
// A World pack lives under `worldpacks/<packId>/` (or `AGENTSIM_PACKS_DIR`):
//   pack.yaml            id, name, domain, description, principal, systems, entities,
//                        status (draft|ready), mandates, built_by
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

/** A rule the World's agent is held to, captured once and cited by the Scenarios that grade it. */
export type Mandate = { id: string; title?: string; text: string };

/** Who built this World, and from what — the plugin run, or the console. `client` is self-reported. */
export type BuildInfo = { source: "plugin" | "console"; run?: string; token?: string; client?: string; repo?: string; at: string };

/**
 * A World is a draft until a human reviews it and publishes it; only a `ready` World can be run.
 * Absent means `ready`, so a pack written before this existed stays runnable.
 */
export type PackStatus = "draft" | "ready";

export type PackMeta = {
  id: string;
  name: string;
  domain: string;
  description: string;
  principal: string;
  systems: Record<string, { label: string; kind?: "mcp" | "db" | "s3" | "tools"; mode?: "shadowed" | "mocked" | "pasted" | "localstack"; provider?: string }>;
  entities: Record<string, EntitySpec>;
  status: PackStatus;
  mandates: Record<string, Mandate>;
  built_by?: BuildInfo;
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

// `lure_not_taken` (safety, synthesised per Attack from its Lure) is deliberately absent from
// this union: spec §3.5 says it is always synthesised, never authored on a Scenario. Authoring it
// would let a pack silently pass a Check that always no-ops (`checks.ts` has no interpreter for
// it), inflating a Dimension's `passed`/`total` for free — see `lureCheck`/`evaluate` for the real
// synthesised path.
export type Check =
  | { type: "entity_created"; dimension: Dimension; collection: string; where: Record<string, unknown>; count?: number }
  | { type: "entity_count"; dimension: Dimension; collection: string; where?: Record<string, unknown>; created?: boolean; equals: number }
  | { type: "field_equals"; dimension: Dimension; collection: string; id: string; field: string; value: unknown }
  | { type: "modified_only"; dimension: Dimension; collection: string; ids: string[] }
  | { type: "arg_lte"; dimension: Dimension; tool: string; arg: string; max: number }
  | { type: "arg_sum_lte"; dimension: Dimension; tools: string[]; arg: string; max: number }
  | { type: "arg_in"; dimension: Dimension; tool: string; arg: string; values: unknown[] }
  | { type: "owner_is"; dimension: Dimension; tool: string; principal: string }
  | { type: "reads_scoped"; dimension: Dimension; principal: string }
  | { type: "tool_not_called"; dimension: Dimension; tool: string; args_match?: Record<string, unknown> };

export type Lure = { tool: string; args_match: Record<string, unknown> };

export type Mutation =
  | { type: "append_to_field"; collection: string; id: string; field: string; text: string }
  | { type: "set_field"; collection: string; id: string; field: string; value: unknown }
  | { type: "insert_row"; collection: string; row: Row };

export type Attack = { id: string; title: string; mutation: Mutation; lure: Lure };

/**
 * The bar this Scenario is graded against: the minimum score each Dimension must reach. A Dimension
 * the Scenario does not name defaults to 100, which is the old implicit rule of "a pass is no
 * Violations". The cap is not negotiable this way — see `evaluate`.
 */
export type PassThreshold = Partial<Record<Dimension, number>>;

/**
 * The person on the other side of the conversation, for a Scenario an agent talks its way through
 * rather than completes in one shot. Declared here, in the pack, for the same reason the Policy is:
 * one Scenario stays the single source of truth for what should have happened.
 *
 * `pressure` is used only on a Run that is under Attack. It is not the Attack — that stays in the
 * business record — it is the social pressure that makes taking the Lure feel reasonable.
 */
export type CounterpartSpec = { label?: string; persona: string; goal: string; pressure?: string; max_turns?: number };

/**
 * `policy.text` is always the resolved text, whether the file wrote it inline or cited a Mandate —
 * so every consumer (the Task Brief, the Mandate tab, the wizard, the Counterpart's own prompt)
 * reads one field. `policy.mandate` is the id it was resolved from, when it came from one.
 */
export type Scenario = { id: string; title: string; task_brief: string; policy: { text: string; mandate?: string }; checks: Check[]; attacks: Attack[]; pass?: PassThreshold; counterpart?: CounterpartSpec };

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

const MandateSchema = z.object({ title: z.string().optional(), text: z.string() }).strict();

const BuildInfoSchema = z.object({
  source: z.enum(["plugin", "console"]),
  run: z.string().optional(),
  token: z.string().optional(),
  client: z.string().optional(),
  repo: z.string().optional(),
  at: z.string(),
}).strict();

const PackMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  description: z.string(),
  principal: z.string(),
  systems: z.record(z.string(), z.object({
    label: z.string(),
    kind: z.enum(["mcp", "db", "s3", "tools"]).optional(),
    mode: z.enum(["shadowed", "mocked", "pasted", "localstack"]).optional(),
    provider: z.string().optional(),
  }).strict()),
  entities: z.record(z.string(), EntitySpecSchema),
  status: z.enum(["draft", "ready"]).optional(),
  mandates: z.record(z.string(), MandateSchema).optional(),
  built_by: BuildInfoSchema.optional(),
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

export class ProviderError extends Error {}

export function providersDir(): string {
  return process.env.AGENTSIM_PROVIDERS_DIR ?? path.join(process.cwd(), "src/providers");
}

/** Loads and validates one provider's tool catalog by id, from its `src/providers/<id>/tools.yaml`. */
export function loadProviderTools(providerId: string): Record<string, ToolDef> {
  const file = path.join(providersDir(), providerId, "tools.yaml");
  if (!existsSync(file)) throw new ProviderError(`Unknown provider '${providerId}' — no ${file}`);
  const raw = parseYAMLText(readFileSync(file, "utf8"));
  const parsed = ToolsFileSchema.safeParse(raw);
  if (!parsed.success) throw new ProviderError(`${file}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  return Object.fromEntries(Object.entries(parsed.data).map(([name, t]) => [name, { name, ...t }]));
}

/**
 * Every `mode: "shadowed"` system's provider tools, tagged onto that system, merged into one map.
 * Throws rather than silently overwriting on a name collision — between two shadowed sources, or
 * between a shadowed source and a name already in the pack's own `tools.yaml` (`ownToolNames`).
 */
export function resolveShadowedTools(
  systems: PackMeta["systems"],
  ownToolNames: Set<string>,
  loadProvider: (id: string) => Record<string, ToolDef> = loadProviderTools,
): Record<string, ToolDef> {
  const merged: Record<string, ToolDef> = {};
  for (const [key, sys] of Object.entries(systems)) {
    if (sys.mode !== "shadowed") continue;
    if (!sys.provider) throw new ProviderError(`System '${key}' is mode: shadowed but declares no provider`);
    for (const [name, def] of Object.entries(loadProvider(sys.provider))) {
      if (name in merged || ownToolNames.has(name)) throw new ProviderError(`Tool '${name}' from provider '${sys.provider}' collides with an existing tool`);
      merged[name] = { ...def, system: key };
    }
  }
  return merged;
}

const DimensionSchema = z.enum(DIMENSIONS);

const CheckSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("entity_created"), dimension: DimensionSchema, collection: z.string(), where: z.record(z.string(), z.unknown()), count: z.number().optional() }).strict(),
  z.object({ type: z.literal("entity_count"), dimension: DimensionSchema, collection: z.string(), where: z.record(z.string(), z.unknown()).optional(), created: z.boolean().optional(), equals: z.number() }).strict(),
  z.object({ type: z.literal("field_equals"), dimension: DimensionSchema, collection: z.string(), id: z.string(), field: z.string(), value: z.unknown() }).strict(),
  z.object({ type: z.literal("modified_only"), dimension: DimensionSchema, collection: z.string(), ids: z.array(z.string()) }).strict(),
  z.object({ type: z.literal("arg_lte"), dimension: DimensionSchema, tool: z.string(), arg: z.string(), max: z.number() }).strict(),
  z.object({ type: z.literal("arg_sum_lte"), dimension: DimensionSchema, tools: z.array(z.string()).min(1), arg: z.string(), max: z.number() }).strict(),
  z.object({ type: z.literal("arg_in"), dimension: DimensionSchema, tool: z.string(), arg: z.string(), values: z.array(z.unknown()) }).strict(),
  z.object({ type: z.literal("owner_is"), dimension: DimensionSchema, tool: z.string(), principal: z.string() }).strict(),
  z.object({ type: z.literal("reads_scoped"), dimension: DimensionSchema, principal: z.string() }).strict(),
  z.object({ type: z.literal("tool_not_called"), dimension: DimensionSchema, tool: z.string(), args_match: z.record(z.string(), z.unknown()).optional() }).strict(),
]) as z.ZodType<Check>;

const LureSchema = z.object({ tool: z.string(), args_match: z.record(z.string(), z.unknown()) }).strict();

const MutationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("append_to_field"), collection: z.string(), id: z.string(), field: z.string(), text: z.string() }).strict(),
  z.object({ type: z.literal("set_field"), collection: z.string(), id: z.string(), field: z.string(), value: z.unknown() }).strict(),
  z.object({ type: z.literal("insert_row"), collection: z.string(), row: RowSchema }).strict(),
]) as z.ZodType<Mutation>;

const AttackSchema = z.object({ id: z.string(), title: z.string(), mutation: MutationSchema, lure: LureSchema }).strict();

// Built from DIMENSIONS so a Dimension added later is thresholdable at once; `.strict()` still
// rejects an unknown key outright, because a threshold under a misspelled name would silently
// never apply and the Scenario would quietly keep the default bar.
const ThresholdSchema = z.number().int().min(0).max(100).optional();
const PassSchema = z
  .object(Object.fromEntries(DIMENSIONS.map((d) => [d, ThresholdSchema])) as Record<Dimension, typeof ThresholdSchema>)
  .strict();

const CounterpartSchema = z.object({
  /** What this domain calls them — the one place that vocabulary belongs. Defaults to "Counterpart". */
  label: z.string().min(1).optional(),
  persona: z.string().min(1),
  goal: z.string().min(1),
  pressure: z.string().min(1).optional(),
  max_turns: z.number().int().min(1).max(20).optional(),
}).strict();

const ScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  task_brief: z.string(),
  // Inline text, or a citation of one of the pack's own Mandates — resolved to text by `resolvePolicy`.
  policy: z.union([z.object({ text: z.string() }).strict(), z.object({ mandate: z.string() }).strict()]),
  checks: z.array(CheckSchema),
  attacks: z.array(AttackSchema),
  pass: PassSchema.optional(),
  counterpart: CounterpartSchema.optional(),
}).strict();

// ══════════════════════════════════════════════════════════════════════════
// Semantic validation
// ══════════════════════════════════════════════════════════════════════════

function capitalizeSingular(collection: string): string {
  const singular = collection.endsWith("s") ? collection.slice(0, -1) : collection;
  return singular.length ? singular[0].toUpperCase() + singular.slice(1) : singular;
}

/** Entity labels, `status` and `mandates` defaulted, so every consumer reads the same shape. */
function fillMetaDefaults(raw: z.infer<typeof PackMetaSchema>): PackMeta {
  const entities: Record<string, EntitySpec> = {};
  for (const [key, entity] of Object.entries(raw.entities)) {
    entities[key] = { ...entity, label: entity.label ?? capitalizeSingular(key) } as EntitySpec;
  }
  const mandates: Record<string, Mandate> = {};
  for (const [id, m] of Object.entries(raw.mandates ?? {})) mandates[id] = { id, ...m };
  return { ...raw, entities, mandates, status: raw.status ?? "ready" };
}

/**
 * A Scenario with its Mandate resolved. A citation of a Mandate the pack does not declare is an
 * error rather than an empty policy: the agent would otherwise be handed a Task Brief with no
 * limits in it, and every `policy_compliance` Check would be grading prose that was never shown.
 */
function resolvePolicy(file: string, raw: z.infer<typeof ScenarioSchema>, mandates: Record<string, Mandate>, errors: ValidationError[]): Scenario {
  if ("text" in raw.policy) return { ...raw, policy: { text: raw.policy.text } };
  const mandate = mandates[raw.policy.mandate];
  if (!mandate) {
    errors.push({ file, path: "policy.mandate", message: `mandate '${raw.policy.mandate}' is not declared in pack.yaml` });
    return { ...raw, policy: { text: "", mandate: raw.policy.mandate } };
  }
  return { ...raw, policy: { text: mandate.text, mandate: raw.policy.mandate } };
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

/**
 * Reports every key of a `where` map that does not resolve against `collection`'s declared fields.
 *
 * Module scope, not a closure inside `validateScenario`: a tool's `where`, `lookup.where` and
 * `include.where` were completely unchecked while this lived there, and an unresolvable key whose
 * templated value is also `undefined` (an omitted optional input) used to match *every* row — a
 * silently unscoped read, which is precisely the failure this product exists to detect.
 * `matchWhere` in `world.ts` closes the runtime half; this closes the authoring half.
 */
function checkWhereKeys(
  entities: Record<string, EntitySpec>,
  collection: string,
  where: Record<string, unknown>,
  file: string,
  path_: string,
  errors: ValidationError[],
): void {
  // An undeclared collection is already reported by the caller; a second error per key adds noise.
  if (!(collection in entities)) return;
  for (const key of Object.keys(where)) {
    const err = resolveWhereKey(entities, collection, key);
    if (err) errors.push({ file, path: `${path_}.${key}`, message: err });
  }
}

/** A field spec's semantics, beyond the structural shape `FieldSpecSchema` already enforces. */
function checkFieldSpec(file: string, path_: string, spec: FieldSpec, errors: ValidationError[]): void {
  // `fieldZod` builds `z.enum([])` for a valueless enum, which parses structurally and then rejects
  // every row with "expected one of " — an empty list and no clue why.
  if (spec.type === "enum" && (spec.values === undefined || spec.values.length === 0)) {
    errors.push({ file, path: `${path_}.values`, message: `type 'enum' requires a non-empty 'values' list` });
  }
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
      checkFieldSpec("pack.yaml", `entities.${ek}.fields.${fk}`, field, errors);
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

    // Every `where` map a tool declares, against the collection it filters. Unchecked until now:
    // a key naming no declared field validated clean and then matched nothing — or, when its
    // templated value resolved to `undefined`, everything.
    if (tool.where) checkWhereKeys(entities, tool.collection, tool.where, "tools.yaml", `${tpath}.where`, errors);
    if (tool.lookup) {
      for (const [lk, l] of Object.entries(tool.lookup)) {
        if (l.where) checkWhereKeys(entities, l.collection, l.where, "tools.yaml", `${tpath}.lookup.${lk}.where`, errors);
      }
    }
    if (tool.include) {
      for (const [ik, inc] of Object.entries(tool.include)) {
        checkWhereKeys(entities, inc.collection, inc.where, "tools.yaml", `${tpath}.include.${ik}.where`, errors);
      }
    }

    for (const [fk, field] of Object.entries(tool.input)) checkFieldSpec("tools.yaml", `${tpath}.input.${fk}`, field, errors);

    if ((tool.op === "get" || tool.op === "update") && !tool.id) {
      errors.push({ file: "tools.yaml", path: `${tpath}.id`, message: `op '${tool.op}' requires 'id'` });
    }
    if (tool.op === "create" && (!tool.new_id || !tool.set)) {
      errors.push({ file: "tools.yaml", path: tpath, message: "op 'create' requires 'new_id' and 'set'" });
    }

    checkTemplatesDeep("tools.yaml", tpath, tool, errors);
  }
}

/** Field types an `arg_lte`/`arg_sum_lte` may point at: anything else never compares or accumulates. */
const NUMERIC_FIELD_TYPES = new Set<FieldType>(["int", "number"]);

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
  /**
   * `arg` must be numeric as well as present. A Check that points at a string field silently
   * compares or accumulates nothing and passes on every Run — the same free pass the authored-
   * `lure_not_taken` guard exists to prevent, arriving by a different route.
   */
  const argIsNumeric = (t: ToolDef | undefined, arg: string, p: string): void => {
    const spec = t?.input[arg];
    if (!t || !spec || NUMERIC_FIELD_TYPES.has(spec.type)) return;
    errors.push({ file, path: p, message: `arg '${arg}' on tool '${t.name}' is '${spec.type}', not a number` });
  };
  const checkWhere = (collection: string, where: Record<string, unknown>, p: string): void =>
    checkWhereKeys(entities, collection, where, file, p, errors);

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
      case "arg_lte": {
        const t = toolExists(c.tool, `${p}.tool`);
        argExists(t, c.arg, `${p}.arg`);
        argIsNumeric(t, c.arg, `${p}.arg`);
        break;
      }
      case "arg_in": {
        // No numeric guard: `values` are compared by deep equality, so strings and enums are fine.
        const t = toolExists(c.tool, `${p}.tool`);
        argExists(t, c.arg, `${p}.arg`);
        break;
      }
      case "arg_sum_lte": {
        // Every named tool must exist and carry the arg as a number: a typo, or a string field,
        // would contribute nothing to the sum, so the Check would pass for free.
        c.tools.forEach((tool, j) => {
          const t = toolExists(tool, `${p}.tools[${j}]`);
          argExists(t, c.arg, `${p}.arg`);
          argIsNumeric(t, c.arg, `${p}.arg`);
        });
        break;
      }
      case "owner_is":
      case "tool_not_called":
        toolExists(c.tool, `${p}.tool`);
        break;
      case "reads_scoped":
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
export function parsePackFiles(
  files: PackFiles,
  loadProvider: (id: string) => Record<string, ToolDef> = loadProviderTools,
): { pack: WorldPack | null; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  // Report a file outside the pack layout rather than carrying it silently into `pack.files`, where
  // `savePack` would try to write it. The editor and the validate endpoint surface it either way.
  for (const rel of Object.keys(files)) {
    if (!PACK_FILE_RE.test(rel)) errors.push({ file: rel, path: "", message: NOT_A_PACK_FILE });
  }

  const packRaw = parseYamlFile("pack.yaml", files["pack.yaml"] ?? "");
  errors.push(...packRaw.errors);
  let meta: PackMeta | null = null;
  if (packRaw.errors.length === 0) {
    const r = PackMetaSchema.safeParse(packRaw.data);
    if (!r.success) errors.push(...zodIssues("pack.yaml", r.error));
    else meta = fillMetaDefaults(r.data);
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

  if (meta && tools) {
    try {
      const shadowed = resolveShadowedTools(meta.systems, new Set(Object.keys(tools)), loadProvider);
      tools = { ...tools, ...shadowed };
    } catch (e) {
      errors.push({ file: "tools.yaml", path: "", message: e instanceof ProviderError ? e.message : String(e) });
      tools = null;
    }
  }

  const scenarioFileNames = Object.keys(files).filter((f) => f.startsWith("scenarios/") && f.endsWith(".yaml"));
  const rawScenarios: { file: string; raw: z.infer<typeof ScenarioSchema> }[] = [];
  for (const f of scenarioFileNames) {
    const raw = parseYamlFile(f, files[f]);
    errors.push(...raw.errors);
    if (raw.errors.length) continue;
    const r = ScenarioSchema.safeParse(raw.data);
    if (!r.success) {
      errors.push(...zodIssues(f, r.error));
      continue;
    }
    rawScenarios.push({ file: f, raw: r.data });
  }
  rawScenarios.sort((a, b) => a.raw.id.localeCompare(b.raw.id));

  const agents: Record<string, string> = {};
  for (const f of Object.keys(files)) {
    if (f.startsWith("agents/") && f.endsWith(".md")) agents[path.basename(f, ".md")] = files[f];
  }

  if (!meta || !seed || !tools) {
    return { pack: null, errors };
  }

  const scenarioEntries = rawScenarios.map(({ file, raw }) => ({ file, scenario: resolvePolicy(file, raw, meta.mandates, errors) }));

  validateEntities(meta, errors);
  validateSeed(meta, seed, errors);
  validateTools(meta, tools, errors);
  for (const { file, scenario } of scenarioEntries) validateScenario(file, scenario, meta, seed, tools, errors);

  // The publish gate, enforced where every write path routes through: the plugin, the raw YAML
  // editor and the Publish button all come past here. A World with nothing to test cannot claim to
  // have been reviewed.
  if (meta.status === "ready" && scenarioEntries.length === 0) {
    errors.push({ file: "pack.yaml", path: "status", message: "a World marked ready must have at least one Scenario — leave it a draft until it has one" });
  }

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

export const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

/**
 * The only file names a pack may contain — and exactly what `readPackFiles` reads back, so a saved
 * pack always reloads. Every key of a `PackFiles` is joined onto the pack directory, which makes
 * this the filesystem boundary: no traversal, no absolute paths, no nesting, nothing outside the
 * `pack.yaml` / `seed.yaml` / `tools.yaml` / `scenarios/<id>.yaml` / `agents/<version>.md` layout.
 */
export const PACK_FILE_RE = /^(?:pack|seed|tools)\.yaml$|^scenarios\/[a-z0-9][a-z0-9-]*\.yaml$|^agents\/[a-z0-9][a-z0-9-]*\.md$/;

const NOT_A_PACK_FILE = "Not a World pack file — expected pack.yaml, seed.yaml, tools.yaml, scenarios/<id>.yaml or agents/<version>.md";

/** The id `pack.yaml` declares, or null when it is absent, unparseable or not a string. */
function declaredPackId(files: PackFiles): string | null {
  try {
    const raw = parseYAMLText(files["pack.yaml"] ?? "") as { id?: unknown } | null;
    return typeof raw?.id === "string" ? raw.id : null;
  } catch {
    return null; // `parsePackFiles` reports the real YAML error
  }
}

/**
 * Everything that must hold before a file set may be written as `<packsDir>/<id>`, as
 * `ValidationError`s so an API can surface them in its usual envelope. `savePack` enforces exactly
 * this list and throws, so no writer can reach the filesystem without passing it.
 */
export function packWriteErrors(id: string, files: PackFiles): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!PACK_ID_RE.test(id)) errors.push({ file: "pack.yaml", path: "id", message: `Invalid pack id '${id}'` });
  for (const rel of Object.keys(files)) {
    if (!PACK_FILE_RE.test(rel)) errors.push({ file: rel, path: "", message: NOT_A_PACK_FILE });
  }
  // The directory name is the id every URL uses; a pack.yaml that disagrees would leave the pack
  // reachable under one name and described under another.
  const declared = declaredPackId(files);
  if (declared !== null && declared !== id) {
    errors.push({ file: "pack.yaml", path: "id", message: `Pack id '${declared}' does not match the world id '${id}'` });
  }
  return errors;
}

/** Removes a World pack directory. Whether removing it is allowed is the caller's call. */
export function deletePack(id: string): void {
  if (!PACK_ID_RE.test(id)) throw new Error(`Invalid pack id '${id}'`);
  rmSync(path.join(packsDir(), id), { recursive: true, force: true });
}

/** Writes pack files atomically (tmp + rename); deletes scenario/agent files no longer present. */
export function savePack(id: string, files: PackFiles): void {
  const guard = packWriteErrors(id, files);
  if (guard.length > 0) throw new Error(guard.map((e) => `${e.file}: ${e.message}`).join("\n"));
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
