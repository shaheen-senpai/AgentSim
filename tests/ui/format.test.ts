import { describe, expect, it } from "vitest";
import type { ToolDef } from "@/engine/pack";
import type { Event } from "@/engine/types";
import { clockTime, fmtArgs, prettyJson, summarizeResult } from "@/ui/format";

function tool(overrides: Partial<ToolDef> & Pick<ToolDef, "op" | "collection">): ToolDef {
  return {
    name: "test_tool",
    system: "sys",
    kind: overrides.op === "get" || overrides.op === "list" ? "read" : "write",
    description: "",
    input: {},
    subject: { collection: overrides.collection, id: "" },
    ...overrides,
  };
}

function ev(overrides: Partial<Event> & Pick<Event, "tool">): Event {
  return {
    seq: 1,
    toolUseId: "toolu_1",
    input: {},
    isError: false,
    changes: [],
    startedAt: 0,
    endedAt: 0,
    at: 0,
    source: "reference",
    batchId: null,
    injected: null,
    ...overrides,
  };
}

describe("fmtArgs", () => {
  it("joins key: value pairs, hiding legacy text-ish names when no tool is given", () => {
    expect(fmtArgs({ payment_id: "pay_7001", amount: 12000, reason: "long text" })).toBe("payment_id: pay_7001 · amount: £120.00");
    expect(fmtArgs({ ticket_id: "tkt_1001", status: "resolved" })).toBe("ticket_id: tkt_1001 · status: resolved");
  });

  it("hides only the fields a given ToolDef declares as type: text, ignoring the legacy name list", () => {
    const t = tool({
      op: "update",
      collection: "widgets",
      input: {
        widget_id: { type: "string" },
        description: { type: "text" },
        reason: { type: "string" }, // named like the legacy fallback, but not text on this tool
      },
    });
    expect(fmtArgs({ widget_id: "wdg_1", description: "very long free text", reason: "dup charge" }, t)).toBe("widget_id: wdg_1 · reason: dup charge");
  });

  it("does not hide a tool-declared text field's name-alike when no tool is given", () => {
    // "description" isn't in the legacy fallback set, so without a tool it's shown in full.
    expect(fmtArgs({ widget_id: "wdg_1", description: "very long free text" })).toBe("widget_id: wdg_1 · description: very long free text");
  });
});

describe("summarizeResult", () => {
  it("get: <Label> <id> plus a couple of the row's scalar fields", () => {
    const t = tool({ op: "get", collection: "tickets" });
    const e = ev({ tool: "get_ticket", result: JSON.stringify({ id: "tkt_1001", status: "open", subject: "Help me", customer_id: "cus_1" }) });
    expect(summarizeResult(t, e)).toBe("Ticket tkt_1001 · status: open · subject: Help me");
  });

  it("list: n rows", () => {
    const t = tool({ op: "list", collection: "payments" });
    expect(summarizeResult(t, ev({ tool: "list_payments", result: JSON.stringify([{ id: "pay_1" }, { id: "pay_2" }]) }))).toBe("2 rows");
    expect(summarizeResult(t, ev({ tool: "list_payments", result: JSON.stringify([{ id: "pay_1" }]) }))).toBe("1 row");
  });

  it("create: → <id>, from the row's own id or a <singular collection>_id field in a custom `returns`", () => {
    const email = tool({ op: "create", collection: "emails" });
    expect(summarizeResult(email, ev({ tool: "send_email", result: JSON.stringify({ ok: true, id: "eml_9103" }) }))).toBe("→ eml_9103");

    const refund = tool({ op: "create", collection: "refunds" });
    expect(summarizeResult(refund, ev({ tool: "issue_refund", result: JSON.stringify({ ok: true, refund_id: "ref_0002", amount: 12000 }) }))).toBe("→ ref_0002");
  });

  it("update: → <field> = <value>, the field tool.set declares", () => {
    const t = tool({ op: "update", collection: "tickets", set: { status: "" } });
    expect(summarizeResult(t, ev({ tool: "set_ticket_status", result: JSON.stringify({ ok: true, status: "resolved" }) }))).toBe("→ status = resolved");
  });

  it("error: ✗ <error>, regardless of tool", () => {
    const t = tool({ op: "get", collection: "orders" });
    expect(summarizeResult(t, ev({ tool: "get_order", error: "No order ord_9999", isError: true }))).toBe("✗ No order ord_9999");
  });

  it("falls back to a truncated result string when it cannot parse", () => {
    const t = tool({ op: "get", collection: "orders" });
    const long = "not json at all ".repeat(10);
    expect(summarizeResult(t, ev({ tool: "get_order", result: long }))).toBe(long.slice(0, 80));
  });

  it("falls back to a truncated result string when no ToolDef is available", () => {
    const long = JSON.stringify({ foo: "bar", baz: "qux long value here that goes on" });
    expect(summarizeResult(undefined, ev({ tool: "unknown_tool", result: long }))).toBe(long.slice(0, 80));
  });
});

describe("prettyJson", () => {
  it("re-indents a JSON result for reading", () => {
    expect(prettyJson('{"a":1,"b":[2,3]}')).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
  });

  it("returns anything that does not parse untouched, rather than swallowing it", () => {
    expect(prettyJson("No order ord_9999")).toBe("No order ord_9999");
    expect(prettyJson("")).toBe("");
  });
});

describe("clockTime", () => {
  it("is HH:MM:SS.mmm in UTC, so a Run reads the same on every machine", () => {
    expect(clockTime(Date.UTC(2026, 8, 12, 20, 14, 3, 456))).toBe("20:14:03.456");
  });
});
