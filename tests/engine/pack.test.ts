import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { inputJsonSchema, inputZod, listPackIds, loadPack, loadProviderTools, packWriteErrors, parsePackFiles, savePack, type PackFiles } from "@/engine/pack";
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
    expect(Object.keys(p.tools)).toHaveLength(9);
    expect(p.tools.create_refund.guards).toHaveLength(1);
    expect(p.scenarios[0].id).toBe("duplicate-charge-refund");
    expect(p.scenarios[0].checks).toHaveLength(8);
    expect(p.scenarios[0].attacks[0].mutation.type).toBe("append_to_field");
    expect(Object.keys(p.agents).sort()).toEqual(["fixed", "naive"]);
    expect(listPackIds()).toEqual(["northwind"]);
  });
  it("tool input → zod and JSON schema", () => {
    const p = loadPack("northwind");
    const z = inputZod(p.tools.create_refund);
    expect(z.safeParse({ payment_intent: "pay_1", amount: 5, reason: "duplicate" }).success).toBe(true);
    expect(z.safeParse({ payment_intent: "pay_1", amount: 5, reason: "goodwill" }).success).toBe(false);
    expect(inputZod(p.tools.update_ticket).safeParse({ ticket_id: "t", status: "resolved" }).success).toBe(false);
    const js = inputJsonSchema(p.tools.create_refund) as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(js.properties).sort()).toEqual(["amount", "payment_intent", "reason"]);
    expect(js.required.sort()).toEqual(["payment_intent"]);
  });
});

describe("parsePackFiles validation", () => {
  const withSeed = (edit: (s: string) => string) => parsePackFiles({ ...files(), "seed.yaml": edit(files()["seed.yaml"]) });
  it("accepts the real pack", () => { expect(parsePackFiles(files()).errors).toEqual([]); });
  it("parses a systems entry with kind/mode/provider", () => {
    const f = files();
    const packYaml = f["pack.yaml"].replace(
      "  payments: { label: Payments, kind: mcp, mode: shadowed, provider: stripe }\nentities:",
      "  payments: { label: Payments, kind: mcp, mode: shadowed, provider: stripe }\n  slack:    { label: Slack, kind: mcp, mode: shadowed, provider: slack }\nentities:",
    );
    expect(packYaml).not.toBe(f["pack.yaml"]);
    // Stub only the newly added `slack` provider: this test is about pack.yaml's systems schema
    // round-tripping kind/mode/provider, not about resolving a real `src/providers/slack` catalog
    // (Task 5+) — the pack's other shadowed systems (stripe/zendesk/google-workspace) still need
    // their real catalogs resolved so the scenario's checks/lure keep validating.
    const { pack, errors } = parsePackFiles(
      { ...f, "pack.yaml": packYaml },
      (id) => (id === "slack" ? {} : loadProviderTools(id)),
    );
    expect(errors).toEqual([]);
    expect(pack!.meta.systems.slack).toEqual({ label: "Slack", kind: "mcp", mode: "shadowed", provider: "slack" });
  });
  it("still parses a systems entry with only a label (backward compatible)", () => {
    const f = files();
    const stripped = f["pack.yaml"].replace("  orders:   { label: Orders,   kind: db,  mode: mocked }", "  orders:   { label: Orders }");
    expect(stripped).not.toBe(f["pack.yaml"]);
    const { pack, errors } = parsePackFiles({ ...f, "pack.yaml": stripped });
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
    const r = withSeed((s) => s.replace("status: open", "status: resolved"));
    expect(r.errors.some((e) => e.file === "seed.yaml" && /resolved/.test(e.message))).toBe(true);
  });
  it("rejects a scenario referencing an unknown entity, tool or field", () => {
    const f = files();
    const bad = f["scenarios/duplicate-charge-refund.yaml"].replace("id: tkt_1001, field: status", "id: tkt_9999, field: status").replace("tool: create_refund, arg: amount", "tool: issue_money, arg: amount");
    const r = parsePackFiles({ ...f, "scenarios/duplicate-charge-refund.yaml": bad });
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(/tkt_9999/);
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(/issue_money/);
  });
  it("rejects an arg_sum_lte naming a tool that does not exist — a typo would otherwise sum nothing and pass for free", () => {
    const f = files();
    const bad = f["scenarios/duplicate-charge-refund.yaml"].replace(
      "  - { type: reads_scoped,   dimension: data_access,       principal: cus_001 }",
      "  - { type: reads_scoped,   dimension: data_access,       principal: cus_001 }\n  - { type: arg_sum_lte, dimension: policy_compliance, tools: [create_refund, issue_money], arg: amount, max: 15000 }",
    );
    const r = parsePackFiles({ ...f, "scenarios/duplicate-charge-refund.yaml": bad });
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(/issue_money/);
  });
  it("rejects an arg_sum_lte with an empty `tools` list — it would sum nothing and pass for free", () => {
    const f = files();
    const bad = f["scenarios/duplicate-charge-refund.yaml"].replace(
      "  - { type: reads_scoped,   dimension: data_access,       principal: cus_001 }",
      "  - { type: reads_scoped,   dimension: data_access,       principal: cus_001 }\n  - { type: arg_sum_lte, dimension: policy_compliance, tools: [], arg: amount, max: 15000 }",
    );
    const r = parsePackFiles({ ...f, "scenarios/duplicate-charge-refund.yaml": bad });
    expect(r.pack).toBeNull();
    expect(r.errors.some((e) => e.file === "scenarios/duplicate-charge-refund.yaml")).toBe(true);
  });
  it("rejects an arg_sum_lte naming a real tool that has no such input field", () => {
    // send_email exists and is spelled correctly, but carries no `amount` — it would contribute
    // nothing to the sum.
    const f = files();
    const bad = f["scenarios/duplicate-charge-refund.yaml"].replace(
      "  - { type: reads_scoped,   dimension: data_access,       principal: cus_001 }",
      "  - { type: reads_scoped,   dimension: data_access,       principal: cus_001 }\n  - { type: arg_sum_lte, dimension: policy_compliance, tools: [create_refund, send_email], arg: amount, max: 15000 }",
    );
    const r = parsePackFiles({ ...f, "scenarios/duplicate-charge-refund.yaml": bad });
    expect(r.errors.map((e) => e.message).join("\n")).toMatch(/is not an input field of tool 'send_email'/);
  });
  it("rejects a summed or capped arg that is not numeric — it would never accumulate and pass for free", () => {
    const f = files();
    const sum = f["scenarios/duplicate-charge-refund.yaml"].replace(
      "  - { type: reads_scoped,   dimension: data_access,       principal: cus_001 }",
      "  - { type: reads_scoped,   dimension: data_access,       principal: cus_001 }\n  - { type: arg_sum_lte, dimension: policy_compliance, tools: [create_refund], arg: payment_intent, max: 15000 }",
    );
    expect(parsePackFiles({ ...f, "scenarios/duplicate-charge-refund.yaml": sum }).errors.map((e) => e.message).join("\n")).toMatch(/not a number/);

    // The same hole in the pre-existing per-call Check, closed by the same guard.
    const lte = f["scenarios/duplicate-charge-refund.yaml"].replace("tool: create_refund, arg: amount, max: 4999", "tool: create_refund, arg: payment_intent, max: 4999");
    expect(parsePackFiles({ ...f, "scenarios/duplicate-charge-refund.yaml": lte }).errors.map((e) => e.message).join("\n")).toMatch(/not a number/);
  });
  it("accepts a Scenario pass threshold, and rejects a misspelled Dimension or an out-of-range bar", () => {
    const f = files();
    const withPass = (block: string) => ({ ...f, "scenarios/duplicate-charge-refund.yaml": `${f["scenarios/duplicate-charge-refund.yaml"]}\npass:\n${block}` });
    expect(parsePackFiles(withPass("  correctness: 80\n")).errors).toEqual([]);
    // A threshold under a misspelled key would silently never apply, so `.strict()` must reject it.
    expect(parsePackFiles(withPass("  corectness: 80\n")).pack).toBeNull();
    expect(parsePackFiles(withPass("  correctness: 150\n")).pack).toBeNull();
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
    const r = parsePackFiles({ ...f, "pack.yaml": pack, "tools.yaml": f["tools.yaml"].replace("collection: orders\n  id: \"${input.order_id}\"", "collection: rebates\n  id: \"${input.order_id}\"") });
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
    // Northwind's own tools.yaml no longer declares a `lookup`/`include` tool of its own (both
    // moved into the shadowed stripe/google-workspace/zendesk catalogs) — probe tools appended
    // here exercise the same `checkWhereKeys` path against `lookup.where`/`include.where` directly.
    const f = files();
    const lookup = `${f["tools.yaml"]}\nprobe_lookup:\n  system: orders\n  kind: read\n  description: probe\n  input: { order_id: string }\n  op: get\n  collection: orders\n  id: "\${input.order_id}"\n  subject: { collection: orders, id: "\${input.order_id}" }\n  lookup:\n    cust: { collection: customers, where: { not_a_field: "\${input.order_id}" } }\n`;
    expect(lookup).not.toBe(f["tools.yaml"]);
    expect(parsePackFiles({ ...f, "tools.yaml": lookup }).errors.some((e) => /not_a_field/.test(e.message))).toBe(true);

    const include = `${f["tools.yaml"]}\nprobe_include:\n  system: orders\n  kind: read\n  description: probe\n  input: { order_id: string }\n  op: get\n  collection: orders\n  id: "\${input.order_id}"\n  subject: { collection: orders, id: "\${input.order_id}" }\n  include:\n    xs: { collection: orders, where: { nope: "\${input.order_id}" } }\n`;
    expect(include).not.toBe(f["tools.yaml"]);
    expect(parsePackFiles({ ...f, "tools.yaml": include }).errors.some((e) => /'nope'/.test(e.message))).toBe(true);
  });

  it("rejects `type: enum` with no `values` — structurally fine, then rejects every row with \"expected one of \"", () => {
    const f = files();
    const entity = f["pack.yaml"].replace("status: { type: enum, values: [new, open, pending, hold, solved, closed] }", "status: { type: enum }");
    expect(entity).not.toBe(f["pack.yaml"]);
    expect(parsePackFiles({ ...f, "pack.yaml": entity }).errors.some((e) => e.file === "pack.yaml" && /non-empty 'values'/.test(e.message))).toBe(true);

    // Northwind's own tools.yaml no longer declares an enum input of its own — a probe tool
    // appended here exercises the same `checkFieldSpec` path against a tool's `input`.
    const input = `${f["tools.yaml"]}\nprobe_enum:\n  system: orders\n  kind: read\n  description: probe\n  input: { status: { type: enum, values: [] } }\n  op: get\n  collection: orders\n  id: "\${input.status}"\n  subject: { collection: orders, id: "\${input.status}" }\n`;
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
    // A World with no Scenarios is only valid as a draft, so dropping the last one means drafting it.
    savePack("copy", { ...rest, "pack.yaml": `status: draft\n${f["pack.yaml"].replace("id: northwind", "id: copy")}` });
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

// A write tool's `set`, against the collection it writes. Structurally `set` is just a map, so
// before this every one of these authored clean and then failed at run time on every call — the
// shape a generated pack fails in, and the one an operator cannot debug from the console.
describe("set validation", () => {
  const withEnumStatus = (f: PackFiles): PackFiles => {
    const pack = f["pack.yaml"].replace("      status: string", "      status: { type: enum, values: [placed, shipped] }");
    expect(pack).not.toBe(f["pack.yaml"]);
    return { ...f, "pack.yaml": pack };
  };

  const shipTool = (set: string): string =>
    `\nprobe_ship:\n  system: orders\n  kind: write\n  description: probe\n  input: { order_id: string }\n  op: update\n  collection: orders\n  id: "\${input.order_id}"\n  subject: { collection: orders, id: "\${input.order_id}" }\n  set: ${set}\n`;

  it("rejects a literal the field's enum does not declare", () => {
    const f = withEnumStatus(files());
    const r = parsePackFiles({ ...f, "tools.yaml": f["tools.yaml"] + shipTool("{ status: awaiting_placeholder }") });
    const err = r.errors.find((e) => e.file === "tools.yaml" && /awaiting_placeholder/.test(e.message));
    expect(err?.path).toBe("tools.probe_ship.set.status");
  });

  it("accepts a literal the enum does declare", () => {
    const f = withEnumStatus(files());
    const r = parsePackFiles({ ...f, "tools.yaml": f["tools.yaml"] + shipTool("{ status: shipped }") });
    expect(r.errors.filter((e) => e.path.startsWith("tools.probe_ship"))).toEqual([]);
  });

  it("leaves a templated value to the expression checker", () => {
    const f = withEnumStatus(files());
    const r = parsePackFiles({ ...f, "tools.yaml": f["tools.yaml"] + shipTool('{ status: "${input.order_id}" }') });
    expect(r.errors.filter((e) => e.path.startsWith("tools.probe_ship"))).toEqual([]);
  });

  it("rejects a field the collection does not declare", () => {
    const f = files();
    const r = parsePackFiles({ ...f, "tools.yaml": f["tools.yaml"] + shipTool('{ no_such_field: "x" }') });
    expect(r.errors.some((e) => e.path === "tools.probe_ship.set.no_such_field" && /not declared on 'orders'/.test(e.message))).toBe(true);
  });

  it("rejects a create that omits a field the entity requires", () => {
    const f = files();
    const create = `\nprobe_refund:\n  system: orders\n  kind: write\n  description: probe\n  input: { payment_id: string, amount: { type: int, min: 1 } }\n  op: create\n  collection: refunds\n  new_id: { prefix: ref_, width: 4 }\n  subject: { collection: payments, id: "\${input.payment_id}" }\n  set: { payment_id: "\${input.payment_id}", amount: "\${input.amount}" }\n`;
    const r = parsePackFiles({ ...f, "tools.yaml": f["tools.yaml"] + create });
    const missing = r.errors.filter((e) => e.path === "tools.probe_refund.set").map((e) => e.message);
    expect(missing).toEqual([
      "op 'create' on 'refunds' omits required field 'reason'",
      "op 'create' on 'refunds' omits required field 'created_at'",
    ]);
  });
});
