// The ledger-comparison modal rendered to static markup against a recorded golden Run whose agent
// took the Lure — the one place the three highlights (injection point, Violation, Lure taken) must
// all appear together. Server-rendered, so no DOM is needed; `tests/ui/ledgerCompare.test.ts`
// covers the data underneath.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "@/engine/types";
import { normalizeRun, type RunRecord } from "@/runner/store";
import { LedgerCompare } from "@/workspace/run/LedgerCompare";

const GOLDEN = path.join(process.cwd(), "data", "golden", "run_mtztrgl69wo.json");

function attackedRun(): RunRecord {
  return normalizeRun(JSON.parse(readFileSync(GOLDEN, "utf8")) as RunRecord);
}

/** The pack behind this golden Run is not on disk here, so the Seed is the start ledger with the injection undone. */
function seedFor(run: RunRecord): Snapshot {
  const seed = structuredClone(run.startSnapshot);
  const m = run.attack!.mutation;
  if (m.type !== "append_to_field") throw new Error("fixture changed");
  const row = seed.collections[m.collection].find((r) => r.id === m.id)!;
  row[m.field] = String(row[m.field]).replace(m.text, "");
  return seed;
}

const entities = [
  { name: "customers", label: "Customer" },
  { name: "orders", label: "Order" },
  { name: "payments", label: "Payment" },
  { name: "refunds", label: "Refund" },
  { name: "threads", label: "Thread" },
  { name: "emails", label: "Email" },
  { name: "tickets", label: "Ticket" },
];

function render(run: RunRecord, seed: Snapshot | null): string {
  return renderToStaticMarkup(createElement(LedgerCompare, { open: true, onClose: () => {}, run, seedSnapshot: seed, entities }));
}

describe("LedgerCompare (static render)", () => {
  it("opens on Start → End and marks the refund the Lure produced as both a Violation and the Lure", () => {
    const run = attackedRun();
    const html = render(run, seedFor(run));
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Seed → Start");
    expect(html).toContain("Start → End");
    expect(html).toContain("Seed → End");
    // The refund row the lure-taking Event created.
    expect(html).toContain("ref_0002");
    expect(html).toContain("Lure taken");
    // The email row is the injection point, so it stays visible even though the Run did not change it.
    expect(html).toContain("eml_9001");
    expect(html).toContain("Attack injected here");
  });

  it("offers only Start → End when the Seed is unavailable, and still renders", () => {
    const run = attackedRun();
    const html = render(run, null);
    expect(html).toContain("Start → End");
    expect(html).not.toContain("Seed → Start");
    expect(html).not.toContain("Seed → End");
  });

  it("explains itself when a still-running Run has no end ledger and no pack", () => {
    const run = { ...attackedRun(), endSnapshot: null };
    expect(render(run, null)).toContain("Nothing to compare yet");
  });
});
