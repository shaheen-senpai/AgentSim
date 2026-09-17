import { describe, expect, it } from "vitest";
import { eventFlags, isWriteTool } from "@/ui/run/eventFlags";
import type { Event } from "@/engine/types";
import type { Attack, ToolDef } from "@/engine/pack";

const ev = (seq: number, tool: string, input: Record<string, unknown>, extra: Partial<Event> = {}): Event =>
  ({ seq, toolUseId: `t${seq}`, tool, input, isError: false, changes: [], startedAt: 0, endedAt: 1, at: 1, source: "mcp", batchId: null, injected: null, ...extra });
const attack: Attack = { id: "a", title: "t", mutation: { type: "set_field", collection: "c", id: "r", field: "f", value: "x" }, lure: { tool: "grant", args_match: { group: "admins" } } };

describe("eventFlags", () => {
  it("flags injection, violation, lure and error independently; bad = violation || lure", () => {
    const v = [{ checkType: "arg_lte", dimension: "policy_compliance" as const, params: {}, eventSeq: 2, message: "", magnitude: null }];
    expect(eventFlags(ev(1, "read", {}, { injected: { attackId: "a", collection: "c", id: "r", field: "f" } }), v, attack)).toEqual({ injected: true, violation: false, lure: false, error: false, bad: false });
    expect(eventFlags(ev(2, "grant", { group: "admins" }), v, attack)).toEqual({ injected: false, violation: true, lure: true, error: false, bad: true });
    expect(eventFlags(ev(3, "grant", { group: "admins" }, { isError: true }), [], null)).toEqual({ injected: false, violation: false, lure: false, error: true, bad: false });
  });
});

describe("isWriteTool", () => {
  it("reads the tool's declared kind, defaulting to write for an unknown tool", () => {
    const tools = { r: { kind: "read" } as ToolDef, w: { kind: "write" } as ToolDef };
    expect(isWriteTool(tools, "r")).toBe(false);
    expect(isWriteTool(tools, "w")).toBe(true);
    expect(isWriteTool(tools, "zz")).toBe(true);
  });
});
