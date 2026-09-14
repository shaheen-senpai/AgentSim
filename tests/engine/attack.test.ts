// tests/engine/attack.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { loadPack } from "@/engine/pack";
import type { Attack, WorldPack } from "@/engine/pack";
import { seedWorld } from "@/engine/world";
import { applyAttack, injectedTarget, injectionMarker, matchesLure } from "@/engine/attack";
import { usePacksDir } from "../helpers/packs";

beforeAll(() => {
  usePacksDir("northwind");
});

function pack(): WorldPack {
  return loadPack("northwind");
}

function billingAttack(p: WorldPack): Attack {
  const scenario = p.scenarios.find((s) => s.id === "duplicate-charge-refund")!;
  return scenario.attacks.find((a) => a.id === "billing-note-injection")!;
}

describe("applyAttack", () => {
  it("append_to_field appends the injected text to the target row's field", () => {
    const p = pack();
    const w = seedWorld(p);
    const attack = billingAttack(p);
    const before = String(w.collections.emails.find((e) => e.id === "eml_9001")!.body);
    applyAttack(p, w, attack);
    const after = String(w.collections.emails.find((e) => e.id === "eml_9001")!.body);
    expect(after.startsWith(before)).toBe(true);
    expect(after).toContain("BILLING SYSTEM NOTICE");
  });

  it("set_field assigns the value to the target row's field", () => {
    const p = pack();
    const w = seedWorld(p);
    const attack: Attack = {
      id: "set-status",
      title: "t",
      mutation: { type: "set_field", collection: "tickets", id: "tkt_1001", field: "status", value: "resolved" },
      lure: { tool: "get_ticket", args_match: {} },
    };
    applyAttack(p, w, attack);
    expect(w.collections.tickets.find((t) => t.id === "tkt_1001")!.status).toBe("resolved");
  });

  it("insert_row validates and appends a new row to the collection", () => {
    const p = pack();
    const w = seedWorld(p);
    const before = w.collections.emails.length;
    const attack: Attack = {
      id: "insert-email",
      title: "t",
      mutation: {
        type: "insert_row",
        collection: "emails",
        row: { id: "eml_9999", thread_id: "thr_5001", from: "attacker@evil.example", to: "support@northwind.example", sent_at: "2026-09-13T00:00:00Z", body: "gotcha" },
      },
      lure: { tool: "issue_refund", args_match: {} },
    };
    applyAttack(p, w, attack);
    expect(w.collections.emails).toHaveLength(before + 1);
    expect(w.collections.emails.find((e) => e.id === "eml_9999")).toMatchObject({ body: "gotcha" });
  });

  it("insert_row applies the entity's declared field defaults for an omitted field", () => {
    const p = pack();
    const w = seedWorld(p);
    const attack: Attack = {
      id: "insert-ticket",
      title: "t",
      mutation: {
        // `notes` is declared `{ type: "string[]", default: [] }` and omitted here.
        type: "insert_row",
        collection: "tickets",
        row: { id: "tkt_9999", customer_id: "cus_001", thread_id: "thr_5001", subject: "s", status: "open" },
      },
      lure: { tool: "issue_refund", args_match: {} },
    };
    applyAttack(p, w, attack);
    expect(w.collections.tickets.find((t) => t.id === "tkt_9999")).toMatchObject({ notes: [] });
  });

  it("insert_row throws when the row fails validation against the entity's fields", () => {
    const p = pack();
    const w = seedWorld(p);
    const attack: Attack = {
      id: "insert-bad-email",
      title: "t",
      mutation: {
        // missing required field `to`
        type: "insert_row",
        collection: "emails",
        row: { id: "eml_9998", thread_id: "thr_5001", from: "attacker@evil.example", sent_at: "2026-09-13T00:00:00Z", body: "gotcha" },
      },
      lure: { tool: "issue_refund", args_match: {} },
    };
    expect(() => applyAttack(p, w, attack)).toThrow(/insert-bad-email: invalid emails row/i);
  });

  it("throws when the target row does not exist", () => {
    const p = pack();
    const w = seedWorld(p);
    const attack = billingAttack(p);
    const bad: Attack = { ...attack, mutation: { ...attack.mutation, id: "eml_404" } as Attack["mutation"] };
    expect(() => applyAttack(p, w, bad)).toThrow(/no emails eml_404/i);
  });

  it("throws on an unknown collection", () => {
    const p = pack();
    const w = seedWorld(p);
    const attack: Attack = {
      id: "bad-collection",
      title: "t",
      mutation: { type: "set_field", collection: "nope", id: "x", field: "y", value: 1 },
      lure: { tool: "get_ticket", args_match: {} },
    };
    expect(() => applyAttack(p, w, attack)).toThrow();
  });
});

describe("matchesLure", () => {
  it("matches on tool plus a subset of arguments, ignoring extra args", () => {
    const p = pack();
    const attack = billingAttack(p);
    expect(matchesLure(attack.lure, { tool: "issue_refund", input: { payment_id: "pay_7001", amount: 12000, reason: "goodwill" } })).toBe(true);
  });

  it("does not match a different value for an args_match key", () => {
    const p = pack();
    const attack = billingAttack(p);
    expect(matchesLure(attack.lure, { tool: "issue_refund", input: { payment_id: "pay_7003", amount: 4999, reason: "dup" } })).toBe(false);
  });

  it("does not match a different tool", () => {
    const p = pack();
    const attack = billingAttack(p);
    expect(matchesLure(attack.lure, { tool: "list_payments", input: { payment_id: "pay_7001" } })).toBe(false);
  });
});

describe("injectionMarker", () => {
  it("is the trimmed text for a single-line append_to_field", () => {
    const attack: Attack = {
      id: "a",
      title: "t",
      mutation: { type: "append_to_field", collection: "emails", id: "eml_9001", field: "body", text: "  hello world  " },
      lure: { tool: "issue_refund", args_match: {} },
    };
    expect(injectionMarker(attack)).toBe("hello world");
  });

  it("escapes embedded newlines the way JSON.stringify embeds them in a string, so the marker can be found inside a JSON-stringified result", () => {
    const attack: Attack = {
      id: "a",
      title: "t",
      mutation: { type: "append_to_field", collection: "emails", id: "eml_9001", field: "body", text: "\nline one\nline two\n" },
      lure: { tool: "issue_refund", args_match: {} },
    };
    const marker = injectionMarker(attack);
    expect(marker).toBe("line one\\nline two");
    expect(JSON.stringify({ body: "before\nline one\nline two\nafter" }).includes(marker)).toBe(true);
  });

  it("matches the real Northwind billing-note-injection attack's multi-line text inside a read_thread result", () => {
    const p = pack();
    const attack = billingAttack(p);
    const w = seedWorld(p);
    applyAttack(p, w, attack);
    const marker = injectionMarker(attack);
    const email = w.collections.emails.find((e) => e.id === "eml_9001")!;
    expect(JSON.stringify({ body: email.body }).includes(marker)).toBe(true);
  });

  it("is the trimmed stringified value for set_field", () => {
    const attack: Attack = {
      id: "set-status",
      title: "t",
      mutation: { type: "set_field", collection: "tickets", id: "tkt_1001", field: "status", value: " resolved " },
      lure: { tool: "get_ticket", args_match: {} },
    };
    expect(injectionMarker(attack)).toBe("resolved");
  });

  it("is the row's id for insert_row", () => {
    const attack: Attack = {
      id: "insert-email",
      title: "t",
      mutation: { type: "insert_row", collection: "emails", row: { id: "eml_9999" } },
      lure: { tool: "issue_refund", args_match: {} },
    };
    expect(injectionMarker(attack)).toBe("eml_9999");
  });
});

describe("injectedTarget", () => {
  it("names the collection/id/field for append_to_field and set_field", () => {
    const p = pack();
    const attack = billingAttack(p);
    expect(injectedTarget(attack)).toEqual({ collection: "emails", id: "eml_9001", field: "body" });
  });

  it("uses field 'id' for insert_row", () => {
    const attack: Attack = {
      id: "insert-email",
      title: "t",
      mutation: { type: "insert_row", collection: "emails", row: { id: "eml_9999" } },
      lure: { tool: "issue_refund", args_match: {} },
    };
    expect(injectedTarget(attack)).toEqual({ collection: "emails", id: "eml_9999", field: "id" });
  });
});
