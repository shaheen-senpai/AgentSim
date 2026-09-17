import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { inputJsonSchema, inputZod, listPackIds, loadPack, packWriteErrors, parsePackFiles, savePack, type PackFiles } from "@/engine/pack";
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
  it("parses a systems entry with kind/mode/provider", () => {
    const f = files();
    const packYaml = f["pack.yaml"].replace(
      "  payments: { label: Payments }\nentities:",
      "  payments: { label: Payments }\n  stripe:   { label: Stripe, kind: mcp, mode: shadowed, provider: stripe }\nentities:",
    );
    expect(packYaml).not.toBe(f["pack.yaml"]);
    const { pack, errors } = parsePackFiles({ ...f, "pack.yaml": packYaml });
    expect(errors).toEqual([]);
    expect(pack!.meta.systems.stripe).toEqual({ label: "Stripe", kind: "mcp", mode: "shadowed", provider: "stripe" });
  });
  it("still parses a systems entry with only a label (backward compatible)", () => {
    const { pack, errors } = parsePackFiles(files());
    expect(errors).toEqual([]);
    expect(pack!.meta.systems.orders).toEqual({ label: "Orders" });
  });
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
  it("rejects an authored `lure_not_taken` Check — it is synthesised per Attack, never authored on a Scenario", () => {
    const f = files();
    const bad = f["scenarios/duplicate-charge-refund.yaml"].replace(
      "  - { type: reads_scoped,   dimension: data_access,       principal: cus_001 }",
      "  - { type: reads_scoped,   dimension: data_access,       principal: cus_001 }\n  - { type: lure_not_taken, dimension: safety, attackId: billing-note-injection }",
    );
    const r = parsePackFiles({ ...f, "scenarios/duplicate-charge-refund.yaml": bad });
    expect(r.pack).toBeNull();
    expect(r.errors.some((e) => e.file === "scenarios/duplicate-charge-refund.yaml")).toBe(true);
  });
  it("rejects an ownership cycle and a tool over an unknown collection", () => {
    const f = files();
    const pack = f["pack.yaml"].replace("owner: { via: customer_id }             # follow this ref field to reach the principal", "owner: { via: customer_id }").replace(/customers:\n    label: Customer\n    id_prefix: cus_\n    owner: self/, "customers:\n    label: Customer\n    id_prefix: cus_\n    owner: { via: id }");
    const r = parsePackFiles({ ...f, "pack.yaml": pack, "tools.yaml": f["tools.yaml"].replace("collection: refunds\n  new_id", "collection: rebates\n  new_id") });
    const all = r.errors.map((e) => e.message).join("\n");
    expect(all).toMatch(/ownership|principal|cycle/i);
    expect(all).toMatch(/rebates/);
  });
  // A tool's `where` keys were completely unchecked: `checkWhere` lived as a closure inside
  // `validateScenario`, so only a Check's `where` was ever resolved against the declared fields. A
  // probe pack with `where: { no_such_field: "${input.q}" }` validated clean — and then, when `q`
  // was omitted, matched every row in the collection (see `matchWhere` in tests/engine/world.test.ts).
  it("rejects a tool `where` key that names no declared field", () => {
    const f = files();
    const bad = f["tools.yaml"].replace("  where: { customer_id:", "  where: { no_such_field: \"${input.customer_id}\", customer_id:");
    expect(bad).not.toBe(f["tools.yaml"]);
    const r = parsePackFiles({ ...f, "tools.yaml": bad });
    expect(r.pack).toBeNull();
    const err = r.errors.find((e) => e.file === "tools.yaml" && /no_such_field/.test(e.message));
    expect(err, r.errors.map((e) => `${e.path} ${e.message}`).join("\n")).toBeTruthy();
    expect(err!.path).toMatch(/\.where\.no_such_field$/);
  });

  it("rejects an unresolvable key in a tool's `lookup.where` and `include.where` too", () => {
    const f = files();
    const lookup = f["tools.yaml"].replace(
      "    thread: { collection: threads, id: \"${input.thread_id}\" }",
      "    thread: { collection: threads, where: { not_a_field: \"${input.thread_id}\" } }",
    );
    expect(lookup).not.toBe(f["tools.yaml"]);
    expect(parsePackFiles({ ...f, "tools.yaml": lookup }).errors.some((e) => /not_a_field/.test(e.message))).toBe(true);

    const include = f["tools.yaml"].replace(
      "    emails: { collection: emails, where: { thread_id: \"${entity.id}\" }, order_by: sent_at }",
      "    emails: { collection: emails, where: { nope: \"${entity.id}\" }, order_by: sent_at }",
    );
    expect(include).not.toBe(f["tools.yaml"]);
    expect(parsePackFiles({ ...f, "tools.yaml": include }).errors.some((e) => /'nope'/.test(e.message))).toBe(true);
  });

  it("rejects `type: enum` with no `values` — structurally fine, then rejects every row with \"expected one of \"", () => {
    const f = files();
    const entity = f["pack.yaml"].replace("status: { type: enum, values: [open, pending, resolved] }", "status: { type: enum }");
    expect(entity).not.toBe(f["pack.yaml"]);
    expect(parsePackFiles({ ...f, "pack.yaml": entity }).errors.some((e) => e.file === "pack.yaml" && /non-empty 'values'/.test(e.message))).toBe(true);

    const input = f["tools.yaml"].replace("status: { type: enum, values: [open, pending, resolved] }", "status: { type: enum, values: [] }");
    expect(input).not.toBe(f["tools.yaml"]);
    const r = parsePackFiles({ ...f, "tools.yaml": input });
    expect(r.errors.some((e) => e.file === "tools.yaml" && /non-empty 'values'/.test(e.message))).toBe(true);
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

describe("the pack file layout is the filesystem boundary", () => {
  // Every key of a PackFiles is joined onto the pack directory, so an unchecked one writes anywhere.
  // Unique per run: an earlier escape would otherwise leave a file in the temp root that a later
  // run mistakes for its own, turning a real regression into a pass.
  const ESCAPED = `ESCAPED-${process.pid}-${Date.now()}.txt`;
  const escapes = () => [`../../${ESCAPED}`, "../sibling/pack.yaml", "/etc/passwd", "scenarios/../../x.yaml", "scenarios/Upper.yaml", "agents/../evil.md", "README.md", "scenarios/nested/deep.yaml"];

  it("savePack refuses the whole call and writes nothing when a key is outside the layout", () => {
    const f = files();
    const good = { ...f, "pack.yaml": f["pack.yaml"].replace("id: northwind", "id: guarded") };
    for (const key of escapes()) {
      expect(() => savePack("guarded", { ...good, [key]: "pwned" }), key).toThrow(/World pack file/);
    }
    expect(existsSync(path.join(dir, "..", ESCAPED))).toBe(false);
    expect(existsSync(path.join(dir, "sibling"))).toBe(false);
    expect(existsSync(path.join(dir, "guarded"))).toBe(false); // rejected before anything was created
  });

  it("savePack refuses a pack.yaml that disagrees with the directory id", () => {
    const f = files();
    expect(() => savePack("disagrees", f)).toThrow(/does not match/); // f still declares `northwind`
    expect(existsSync(path.join(dir, "disagrees"))).toBe(false);
  });

  it("parsePackFiles reports an unrecognised file rather than silently carrying it", () => {
    const r = parsePackFiles({ ...files(), "../../ESCAPED.txt": "pwned" });
    expect(r.pack).toBeNull();
    expect(r.errors).toContainEqual(expect.objectContaining({ file: "../../ESCAPED.txt", path: "" }));
    expect(r.errors[0].message).toMatch(/World pack file/);
  });

  it("packWriteErrors gives the same three guards as ValidationErrors, so a caller can surface them", () => {
    const f = files();
    expect(packWriteErrors("northwind", f)).toEqual([]);
    expect(packWriteErrors("../escape", f)[0]).toMatchObject({ file: "pack.yaml", path: "id" });
    expect(packWriteErrors("northwind", { ...f, "x.txt": "" })).toContainEqual(expect.objectContaining({ file: "x.txt" }));
    expect(packWriteErrors("elsewhere", f)[0].message).toMatch(/does not match/);
  });

  it("still accepts every name loadPack reads back off disk", () => {
    expect(packWriteErrors("northwind", loadPack("northwind").files)).toEqual([]);
  });
});
