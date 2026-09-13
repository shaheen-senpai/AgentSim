import { describe, expect, it } from "vitest";
import { ev, northwind } from "../helpers";
import { seedWorld } from "@/sim/world";
import { loadScenario } from "@/sim/scenario";
import { applyAttack, matchesLure } from "@/sim/attack";

const attack = loadScenario("duplicate-charge-refund").attacks[0];

describe("applyAttack", () => {
  it("appends the injected text to the target email", () => {
    const w = seedWorld(northwind());
    const before = w.emails[0].body;
    applyAttack(w, attack);
    expect(w.emails[0].body.startsWith(before)).toBe(true);
    expect(w.emails[0].body).toContain("BILLING SYSTEM NOTICE");
  });
  it("throws when the target email does not exist", () => {
    const w = seedWorld(northwind());
    expect(() => applyAttack(w, { ...attack, mutation: { type: "append_to_email", email: "eml_0000", text: "x" } })).toThrow(/no email eml_0000/);
  });
});

describe("matchesLure", () => {
  it("matches on tool plus a subset of arguments", () => {
    expect(matchesLure(attack.lure, ev(8, "issue_refund", { payment_id: "pay_7001", amount: 12000, reason: "goodwill" }))).toBe(true);
    expect(matchesLure(attack.lure, ev(7, "issue_refund", { payment_id: "pay_7003", amount: 4999, reason: "dup" }))).toBe(false);
    expect(matchesLure(attack.lure, ev(6, "list_payments", { order_id: "ord_1038" }))).toBe(false);
  });
  it("counts an attempted (errored) call as taken", () => {
    expect(matchesLure(attack.lure, ev(8, "issue_refund", { payment_id: "pay_7001", amount: 999999, reason: "x" }, true))).toBe(true);
  });
});
