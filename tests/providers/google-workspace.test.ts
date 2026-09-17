import { describe, expect, it } from "vitest";
import { loadProviderTools } from "@/engine/pack";
import type { EntitySpec, WorldPack } from "@/engine/pack";
import { runTool } from "@/engine/dsl";
import { seedWorld } from "@/engine/world";
import type { Row } from "@/engine/types";

describe("google-workspace provider catalog", () => {
  it("parses and exposes get_thread and send_email", () => {
    const tools = loadProviderTools("google-workspace");
    expect(Object.keys(tools).sort()).toEqual(["get_thread", "send_email"]);
    expect(tools.get_thread.include?.messages).toBeDefined();
  });
});

/**
 * A minimal synthetic pack — just enough of Northwind's own entity shapes (customers → threads →
 * emails) to run the real, YAML-loaded `get_thread`/`send_email` tools through `runTool` and
 * exercise their `include`/`lookup` logic for real, not just confirm the YAML parses.
 */
function googleWorkspaceFixturePack(emailRows: Row[]): WorldPack {
  const customers: EntitySpec = {
    label: "Customer", id_prefix: "cus_", owner: "self",
    fields: { id: { type: "string" }, email: { type: "string" } },
  };
  const threads: EntitySpec = {
    label: "Thread", id_prefix: "thr_", owner: { via: "customer_id" },
    fields: { id: { type: "string" }, customer_id: { type: "string", ref: "customers" } },
  };
  const emails: EntitySpec = {
    label: "Email", id_prefix: "eml_", owner: { via: "thread_id" },
    fields: {
      id: { type: "string" }, thread_id: { type: "string", ref: "threads" },
      from: { type: "string" }, to: { type: "string" }, sent_at: { type: "string" }, body: { type: "text" },
    },
  };

  const { get_thread, send_email } = loadProviderTools("google-workspace");

  return {
    meta: {
      id: "google-workspace-fixture", name: "Google Workspace Fixture", domain: "test", description: "test pack", principal: "customers", status: "ready", mandates: {},
      systems: { email: { label: "Email" } },
      entities: { customers, threads, emails },
    },
    seed: {
      now: "2026-01-01T00:00:00Z",
      currency: "USD",
      rows: {
        customers: [{ id: "cus_1", email: "priya.raman@example.com" }],
        threads: [{ id: "thr_1", customer_id: "cus_1" }],
        emails: emailRows,
      },
    },
    tools: { get_thread, send_email },
    scenarios: [],
    agents: {},
    files: {},
  };
}

describe("get_thread (via runTool, against a synthetic World)", () => {
  it("returns the thread's messages in ascending sent_at order, regardless of seed row order", () => {
    // Seeded out of order on purpose: the later email comes first in the array, so a passing
    // assertion proves `order_by: sent_at` actually sorted rather than merely echoing seed order.
    const pack = googleWorkspaceFixturePack([
      { id: "eml_2", thread_id: "thr_1", from: "support@northwind.example", to: "priya.raman@example.com", sent_at: "2026-01-02T00:00:00Z", body: "second" },
      { id: "eml_1", thread_id: "thr_1", from: "priya.raman@example.com", to: "support@northwind.example", sent_at: "2026-01-01T00:00:00Z", body: "first" },
    ]);
    const w = seedWorld(pack);
    const r = runTool(pack, w, "get_thread", { thread_id: "thr_1" });
    const value = JSON.parse(r.result) as { messages: { id: string }[] };
    expect(value.messages.map((m) => m.id)).toEqual(["eml_1", "eml_2"]);
    expect(r.changes).toEqual([]);
  });
});

describe("send_email (via runTool, against a synthetic World)", () => {
  it("resolves the thread → customer lookup chain and sends to the customer's real email", () => {
    const pack = googleWorkspaceFixturePack([]);
    const w = seedWorld(pack);
    const r = runTool(pack, w, "send_email", { thread_id: "thr_1", body: "Hi Priya" });
    const sent = w.collections.emails.at(-1)!;
    expect(sent.id).toBe((JSON.parse(r.result) as { id: string }).id);
    expect(sent.thread_id).toBe("thr_1");
    // Must equal the customer's actual seeded email, not a value that happens to coincide.
    expect(sent.to).toBe(pack.seed.rows.customers[0].email);
    expect(sent.to).toBe("priya.raman@example.com");
    expect(r.changes).toEqual([{ collection: "emails", id: sent.id as string, op: "create" }]);
  });
});
