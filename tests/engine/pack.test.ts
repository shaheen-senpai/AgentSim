import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { inputJsonSchema, inputZod, listPackIds, loadPack, parsePackFiles, savePack, type PackFiles } from "@/engine/pack";
import { usePacksDir } from "../helpers/packs";

let dir: string;
beforeAll(() => { dir = usePacksDir("northwind"); });

const files = (): PackFiles => {
  const root = path.join(process.cwd(), "worldpacks", "northwind");
  return {
    "pack.yaml": readFileSync(path.join(root, "pack.yaml"), "utf8"),
    "seed.yaml": readFileSync(path.join(root, "seed.yaml"), "utf8"),
    "tools.yaml": readFileSync(path.join(root, "tools.yaml"), "utf8"),
    "scenarios/duplicate-charge-refund.yaml": readFileSync(path.join(root, "scenarios/duplicate-charge-refund.yaml"), "utf8"),
    "agents/naive.md": readFileSync(path.join(root, "agents/naive.md"), "utf8"),
  };
};

describe("loadPack", () => {
  it("loads Northwind", () => {
    const p = loadPack("northwind");
    expect(p.meta.principal).toBe("customers");
    expect(Object.keys(p.meta.entities)).toHaveLength(7);
    expect(p.seed.rows.customers).toHaveLength(3);
    expect(p.seed.rows.refunds).toEqual([]);
    expect(Object.keys(p.tools)).toHaveLength(10);
    expect(p.tools.issue_refund.guards).toHaveLength(1);
    expect(p.scenarios[0].id).toBe("duplicate-charge-refund");
    expect(p.scenarios[0].checks).toHaveLength(8);
    expect(p.scenarios[0].attacks[0].mutation.type).toBe("append_to_field");
    expect(Object.keys(p.agents).sort()).toEqual(["fixed", "naive"]);
    expect(listPackIds()).toEqual(["northwind"]);
  });
  it("tool input → zod and JSON schema", () => {
    const p = loadPack("northwind");
    const z = inputZod(p.tools.issue_refund);
    expect(z.safeParse({ payment_id: "pay_1", amount: 5, reason: "x" }).success).toBe(true);
    expect(z.safeParse({ payment_id: "pay_1", amount: 0, reason: "x" }).success).toBe(false);
    expect(inputZod(p.tools.set_ticket_status).safeParse({ ticket_id: "t", status: "closed" }).success).toBe(false);
    const js = inputJsonSchema(p.tools.issue_refund) as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(js.properties).sort()).toEqual(["amount", "payment_id", "reason"]);
    expect(js.required.sort()).toEqual(["amount", "payment_id", "reason"]);
  });
});

describe("parsePackFiles validation", () => {
  const withSeed = (edit: (s: string) => string) => parsePackFiles({ ...files(), "seed.yaml": edit(files()["seed.yaml"]) });
  it("accepts the real pack", () => { expect(parsePackFiles(files()).errors).toEqual([]); });
  it("rejects a broken ref", () => {
    const r = withSeed((s) => s.replace("order_id: ord_1042, amount: 4999,  card_last4: \"4242\", status: succeeded, created_at: 2026-09-11T09:31:07Z", "order_id: ord_9999, amount: 4999,  card_last4: \"4242\", status: succeeded, created_at: 2026-09-11T09:31:07Z"));
    expect(r.errors.some((e) => e.file === "seed.yaml" && /ord_9999/.test(e.message))).toBe(true);
  });
  it("rejects a wrong id prefix", () => {
    const r = withSeed((s) => s.replace("id: cus_001", "id: usr_001"));
    expect(r.errors.some((e) => /usr_001/.test(e.message) && /cus_/.test(e.message))).toBe(true);
  });
  it("rejects an enum value outside `values`", () => {
    const r = withSeed((s) => s.replace("status: open", "status: closed"));
    expect(r.errors.some((e) => e.file === "seed.yaml" && /closed/.test(e.message))).toBe(true);
  });
  it("rejects a scenario referencing an unknown entity, tool or field", () => {
    const f = files();
    const bad = f["scenarios/duplicate-charge-refund.yaml"].replace("id: tkt_1001, field: status", "id: tkt_9999, field: status").replace("tool: issue_refund, arg: amount", "tool: issue_money, arg: amount");
    const r = parsePackFiles({ ...f, "scenarios/duplicate-charge-refund.yaml": bad });
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(/tkt_9999/);
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(/issue_money/);
  });
  it("rejects an ownership cycle and a tool over an unknown collection", () => {
    const f = files();
    const pack = f["pack.yaml"].replace("owner: { via: customer_id }             # follow this ref field to reach the principal", "owner: { via: customer_id }").replace(/customers:\n    label: Customer\n    id_prefix: cus_\n    owner: self/, "customers:\n    label: Customer\n    id_prefix: cus_\n    owner: { via: id }");
    const r = parsePackFiles({ ...f, "pack.yaml": pack, "tools.yaml": f["tools.yaml"].replace("collection: refunds\n  new_id", "collection: rebates\n  new_id") });
    const all = r.errors.map((e) => e.message).join("\n");
    expect(all).toMatch(/ownership|principal|cycle/i);
    expect(all).toMatch(/rebates/);
  });
  it("rejects invalid YAML with a file-scoped error", () => {
    const r = parsePackFiles({ ...files(), "tools.yaml": "get_ticket: [unclosed" });
    expect(r.pack).toBeNull();
    expect(r.errors[0].file).toBe("tools.yaml");
  });
});

describe("savePack", () => {
  it("writes files atomically and removes dropped scenarios", () => {
    const f = files();
    savePack("copy", { ...f, "pack.yaml": f["pack.yaml"].replace("id: northwind", "id: copy") });
    expect(loadPack("copy").meta.id).toBe("copy");
    const { "scenarios/duplicate-charge-refund.yaml": _dropped, ...rest } = f;
    savePack("copy", { ...rest, "pack.yaml": f["pack.yaml"].replace("id: northwind", "id: copy") });
    expect(loadPack("copy").scenarios).toEqual([]);
    expect(listPackIds().sort()).toEqual(["copy", "northwind"]);
    expect(dir).toBeTruthy();
  });
});
