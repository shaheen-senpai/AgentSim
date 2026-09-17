// Migrates v1 Run records (top-level Snapshot arrays, string `agent`, `{seq,at,...,changes:string[]}`
// Events, `append_to_email` Attacks) to Event v2 / World packs (`RunRecord` in `src/runner/store.ts`).
//
// Usage: npx tsx scripts/migrate-runs.ts [--dir data/golden] [--dry-run]
//
// A file whose `startSnapshot` already has a `collections` key is v2 already — skipped, so running
// this twice over the same directory is a no-op the second time. Every migrated file's new Score is
// re-evaluated from its own Events and asserted equal (headline + capped) to the stored v1 Score,
// and its recomputed World diff is asserted the same length as the stored v1 diff, before anything
// is written — a file that fails either assertion is left untouched and the script exits non-zero.
import { parseArgs } from "node:util";
import { readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { injectedTarget, injectionMarker } from "@/engine/attack";
import { diffWorld, unchangedCount } from "@/engine/diff";
import { DIMENSIONS } from "@/engine/dimensions";
import { evaluate } from "@/engine/evaluator";
import { collectionOfId } from "@/engine/ownership";
import { loadPack, type Attack, type Mutation, type WorldPack } from "@/engine/pack";
import type { Change, Event, EventSource, Row, Snapshot } from "@/engine/types";
import type { RunAgentRef, RunRecord } from "@/runner/store";

const PACK_ID = "northwind";

// ─────────────────────────────── v1 shapes (read-only; the v2 shapes above are the write side) ───

type V1Snapshot = { now: string; currency: string } & Record<string, unknown>;

type V1Event = {
  seq: number;
  at: number;
  toolUseId: string;
  tool: string;
  input: Record<string, unknown>;
  result?: string;
  error?: string;
  isError: boolean;
  changes: string[];
};

type V1Mutation = { type: "append_to_email"; email: string; text: string } | Mutation;
type V1Attack = { id: string; title: string; mutation: V1Mutation; lure: Attack["lure"] };

type V1DiffEntry = { op: "added" | "changed"; kind: string; entityId: string; summary: string };

type V1ScoreDimension = { name: string; score: number; passed: number; total: number };
type V1Score = { headline: number; capped: boolean; capReason: string | null; dimensions: V1ScoreDimension[] };

type V1Run = {
  id: string;
  createdAt: string;
  status: "running" | "completed" | "failed";
  scenarioId: string;
  scenarioTitle: string;
  agent: string; // "naive" | "fixed" | "byo"
  attack: V1Attack | null;
  model?: string;
  taskBrief: string;
  startSnapshot: V1Snapshot;
  endSnapshot: V1Snapshot | null;
  events: V1Event[];
  score: V1Score | null;
  diff: V1DiffEntry[] | null;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number | null;
  cappedOut: boolean;
  truncated: boolean;
  transcript: unknown[];
  error: string | null;
  narrative: string | null;
};

/** A v1 file already migrated has `startSnapshot.collections` — v2's Snapshot shape. */
function isAlreadyV2(raw: unknown): boolean {
  const start = (raw as { startSnapshot?: unknown } | null)?.startSnapshot;
  return !!start && typeof start === "object" && "collections" in (start as Record<string, unknown>);
}

// ─────────────────────────────────────────── snapshot ─────────────────────────────────────────────

/** v1's top-level `{customers: [...], orders: [...], ...}` → v2's `{collections: {...}}`, restricted to the pack's declared entities. */
function migrateSnapshot(pack: WorldPack, v1: V1Snapshot): Snapshot {
  const collections: Record<string, Row[]> = {};
  for (const name of Object.keys(pack.meta.entities)) {
    const rows = v1[name];
    collections[name] = Array.isArray(rows) ? (rows as Row[]) : [];
  }
  return { now: v1.now, currency: v1.currency, collections };
}

/** Every row id present anywhere in a Snapshot — used to tell an Event's `create` changes from its `update`s. */
function idsIn(snapshot: Snapshot): Set<string> {
  const ids = new Set<string>();
  for (const rows of Object.values(snapshot.collections)) for (const r of rows) ids.add(r.id);
  return ids;
}

// ──────────────────────────────────────────── attack ───────────────────────────────────────────────

function migrateMutation(m: V1Mutation): Mutation {
  if (m.type === "append_to_email") return { type: "append_to_field", collection: "emails", id: m.email, field: "body", text: m.text };
  return m; // already v2-shaped (append_to_field / set_field / insert_row) — forward-compatible, unused by today's goldens
}

function migrateAttack(a: V1Attack | null): Attack | null {
  if (!a) return null;
  return { id: a.id, title: a.title, mutation: migrateMutation(a.mutation), lure: a.lure };
}

// ──────────────────────────────────────────── agent ────────────────────────────────────────────────

const REFERENCE_MODEL_FALLBACK = "claude-haiku-4-5";

function migrateAgent(agent: string, model: string | undefined): RunAgentRef {
  if (agent === "naive" || agent === "fixed") return { kind: "reference", version: agent, model: model ?? REFERENCE_MODEL_FALLBACK };
  if (agent === "byo") return { kind: "byo", agentId: null, name: "BYO agent", shape: "mcp", toolAliases: {} };
  throw new Error(`Unknown v1 agent value ${JSON.stringify(agent)}`);
}

// ──────────────────────────────────────────── events ───────────────────────────────────────────────

/** v1's `changes: string[]` (entity ids) → v2's `changes: Change[]`; an id whose collection can't be resolved is dropped, with a warning. */
function migrateChanges(pack: WorldPack, ids: string[], startIds: Set<string>, seq: number, warn: (msg: string) => void): Change[] {
  const out: Change[] = [];
  for (const id of ids) {
    const collection = collectionOfId(pack, id);
    if (!collection) {
      warn(`event #${seq}: change id ${JSON.stringify(id)} does not resolve to a known collection — dropped`);
      continue;
    }
    out.push({ collection, id, op: startIds.has(id) ? "update" : "create" });
  }
  return out;
}

/** Whether this read Event ingested the Attack's injected content, per the marker `read_thread`'s `result` would contain. */
function detectInjected(pack: WorldPack, attack: Attack | null, e: V1Event): Event["injected"] {
  if (!attack || typeof e.result !== "string") return null;
  const tool = pack.tools[e.tool];
  if (!tool || tool.kind !== "read") return null;
  if (!e.result.includes(injectionMarker(attack))) return null;
  return { attackId: attack.id, ...injectedTarget(attack) };
}

function migrateEvents(pack: WorldPack, attack: Attack | null, source: EventSource, startIds: Set<string>, v1Events: V1Event[], warn: (msg: string) => void): Event[] {
  return v1Events.map((e) => {
    const out: Event = {
      seq: e.seq,
      toolUseId: e.toolUseId,
      tool: e.tool,
      input: e.input,
      isError: e.isError,
      changes: migrateChanges(pack, e.changes, startIds, e.seq, warn),
      startedAt: e.at,
      endedAt: e.at,
      at: e.at,
      source,
      batchId: null,
      injected: detectInjected(pack, attack, e),
    };
    if (e.result !== undefined) out.result = e.result;
    if (e.error !== undefined) out.error = e.error;
    return out;
  });
}

// ───────────────────────────────────────── score diagnostics ───────────────────────────────────────

function printScoreMismatch(file: string, stored: V1Score, fresh: V1Score): void {
  console.error(`\n✗ ${file}: re-evaluated Score differs from the stored v1 Score — refusing to write.`);
  console.error(`  stored headline=${stored.headline} capped=${stored.capped} capReason=${JSON.stringify(stored.capReason)}`);
  console.error(`  fresh  headline=${fresh.headline} capped=${fresh.capped} capReason=${JSON.stringify(fresh.capReason)}`);
  const byName = (dims: V1ScoreDimension[]) => new Map(dims.map((d) => [d.name, d]));
  const oldD = byName(stored.dimensions);
  const newD = byName(fresh.dimensions);
  for (const name of DIMENSIONS) {
    const o = oldD.get(name);
    const n = newD.get(name);
    if (JSON.stringify(o) !== JSON.stringify(n)) console.error(`  dimension ${name}: stored ${JSON.stringify(o)} vs fresh ${JSON.stringify(n)}`);
  }
}

// ──────────────────────────────────────────────── main ─────────────────────────────────────────────

type Outcome = "skipped" | "migrated" | "failed";

function migrateFile(dir: string, filename: string, dryRun: boolean): Outcome {
  const filePath = path.join(dir, filename);
  const raw: unknown = JSON.parse(readFileSync(filePath, "utf8"));

  if (isAlreadyV2(raw)) {
    console.log(`= ${filename}: already v2 (startSnapshot.collections present) — skipped`);
    return "skipped";
  }

  const v1 = raw as V1Run;
  const pack = loadPack(PACK_ID);
  const scenario = pack.scenarios.find((s) => s.id === v1.scenarioId);
  if (!scenario) throw new Error(`${filename}: unknown scenario ${v1.scenarioId} in pack ${PACK_ID}`);

  const startSnapshot = migrateSnapshot(pack, v1.startSnapshot);
  const endSnapshot = v1.endSnapshot ? migrateSnapshot(pack, v1.endSnapshot) : null;
  const attack = migrateAttack(v1.attack);
  const agent = migrateAgent(v1.agent, v1.model);
  const source: EventSource = v1.agent === "byo" ? "mcp" : "reference";
  const startIds = idsIn(startSnapshot);

  const warnings: string[] = [];
  const events = migrateEvents(pack, attack, source, startIds, v1.events, (msg) => warnings.push(msg));
  for (const w of warnings) console.warn(`  ! ${filename}: ${w}`);

  // A Run with no stored Score/end Snapshot (e.g. a "running"/"failed" leftover in data/runs) has
  // nothing to re-evaluate against — migrate its shape and carry the fields forward as null/[].
  if (!endSnapshot || !v1.score) {
    const migrated: RunRecord = {
      id: v1.id,
      createdAt: v1.createdAt,
      status: v1.status,
      packId: pack.meta.id,
      packName: pack.meta.name,
      scenarioId: v1.scenarioId,
      scenarioTitle: v1.scenarioTitle,
      agent,
      attack,
      taskBrief: v1.taskBrief,
      startSnapshot,
      endSnapshot,
      events,
      violations: [],
      score: null,
      diff: null,
      unchangedCount: null,
      usage: v1.usage,
      durationMs: v1.durationMs,
      cappedOut: v1.cappedOut,
      truncated: v1.truncated,
      transcript: v1.transcript,
      error: v1.error,
      narrative: v1.narrative,
      idleTimeoutMs: null,
      finishedBy: v1.status === "completed" ? "agent" : "error",
    };
    writeAtomic(filePath, migrated, dryRun);
    console.log(`${dryRun ? "would migrate" : "migrated"} ${filename} (no stored Score to re-evaluate — carried forward as null)`);
    return "migrated";
  }

  // A v1 Run that did not complete ended in an error or a timeout, not a deliberate stop — without
  // this the Evaluator would credit it as a refusal.
  const { violations, score } = evaluate({ pack, scenario, attack, start: startSnapshot, end: endSnapshot, events, errored: v1.status !== "completed" });
  if (score.headline !== v1.score.headline || score.capped !== v1.score.capped) {
    printScoreMismatch(filename, v1.score, score);
    return "failed";
  }

  const diff = diffWorld(pack, startSnapshot, endSnapshot);
  const unchanged = unchangedCount(pack, startSnapshot, endSnapshot);
  if (v1.diff && diff.length !== v1.diff.length) {
    console.error(`\n✗ ${filename}: recomputed World diff has ${diff.length} entries, stored v1 diff had ${v1.diff.length} — refusing to write.`);
    console.error(`  stored : ${v1.diff.map((d) => `${d.op} ${d.kind}/${d.entityId}`).join(", ")}`);
    console.error(`  fresh  : ${diff.map((d) => `${d.op} ${d.collection}/${d.entityId}`).join(", ")}`);
    return "failed";
  }

  const migrated: RunRecord = {
    id: v1.id,
    createdAt: v1.createdAt,
    status: v1.status,
    packId: pack.meta.id,
    packName: pack.meta.name,
    scenarioId: v1.scenarioId,
    scenarioTitle: v1.scenarioTitle,
    agent,
    attack,
    taskBrief: v1.taskBrief,
    startSnapshot,
    endSnapshot,
    events,
    violations,
    score,
    diff,
    unchangedCount: unchanged,
    usage: v1.usage,
    durationMs: v1.durationMs,
    cappedOut: v1.cappedOut,
    truncated: v1.truncated,
    transcript: v1.transcript,
    error: v1.error,
    narrative: v1.narrative,
    idleTimeoutMs: null,
    finishedBy: v1.status === "completed" ? "agent" : "error",
  };

  writeAtomic(filePath, migrated, dryRun);
  console.log(
    `${dryRun ? "would migrate" : "migrated"} ${filename} · Trust Score ${score.headline}${score.capped ? ` CAPPED (${score.capReason})` : ""}` +
      ` (stored ${v1.score.headline}${v1.score.capped ? " CAPPED" : ""}, unchanged) · diff ${diff.length} entries (stored ${v1.diff?.length ?? 0}, unchanged)`,
  );
  return "migrated";
}

/** tmp + rename, same as `saveRun` — but at an arbitrary path, since `--dir` need not be `data/runs`. Writes nothing on `dryRun`. */
function writeAtomic(filePath: string, record: RunRecord, dryRun: boolean): void {
  if (dryRun) return;
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(record));
  renameSync(tmp, filePath);
}

function main(): void {
  const { values } = parseArgs({ options: { dir: { type: "string", default: "data/golden" }, "dry-run": { type: "boolean", default: false } } });
  const dir = path.resolve(process.cwd(), values.dir!);
  const dryRun = values["dry-run"] === true;

  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) {
    console.log(`no *.json files in ${dir}`);
    return;
  }

  console.log(`${dryRun ? "[dry-run] " : ""}migrating Runs in ${dir} (${files.length} file${files.length === 1 ? "" : "s"})\n`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  for (const f of files) {
    try {
      const outcome = migrateFile(dir, f, dryRun);
      if (outcome === "migrated") migrated++;
      else if (outcome === "skipped") skipped++;
      else failed++;
    } catch (e) {
      console.error(`\n✗ ${f}: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  console.log(`\n${migrated} migrated, ${skipped} already v2, ${failed} failed${dryRun ? " (dry-run: nothing written)" : ""}`);
  if (failed > 0) process.exit(1);
}

main();
