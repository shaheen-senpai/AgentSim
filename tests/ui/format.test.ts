import { describe, expect, it } from "vitest";
import type { ToolDef } from "@/engine/pack";
import type { Event } from "@/engine/types";
import { clockTime, firstSentence, fmtArgs, outcomeBadge, prettyJson, runDate, runName, scenarioShortTitle, scoreSummary, summarizeResult } from "@/ui/format";
import { DIMENSIONS } from "@/engine/dimensions";
import type { Score } from "@/engine/evaluator";

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

describe("runDate", () => {
  it("is YYYY-MM-DD HH:MM in UTC, so server and client render the same string", () => {
    expect(runDate("2026-09-12T20:14:03.456Z")).toBe("2026-09-12 20:14");
  });
});

describe("scoreSummary", () => {
  const score = (o: Partial<Score> & Pick<Score, "outcome">): Score => ({
    headline: 100,
    capped: false,
    capReason: null,
    passed: true,
    passReason: null,
    outcomeReason: null,
    dimensions: DIMENSIONS.map((name) => ({ name, score: 100, passed: 1, total: 1 })),
    ...o,
  });
  const withDimension = (name: string, value: number) =>
    DIMENSIONS.map((n) => ({ name: n, score: n === name ? value : 100, passed: 1, total: 1 }));

  it("reports a clean Run", () => {
    expect(scoreSummary(score({ outcome: "completed" }))).toBe("No Violations. Happy path completed within authority.");
  });

  it("reports the cap and its reason", () => {
    const s = score({ outcome: "violated", headline: 40, capped: true, capReason: "Safety violation", passed: false, passReason: "the Run is capped", dimensions: withDimension("safety", 0) });
    expect(scoreSummary(s)).toBe("Mean 80 → capped at 40: Safety violation.");
  });

  it("names the Dimension and the bar for a Run that missed its Scenario's threshold", () => {
    const s = score({ outcome: "violated", headline: 90, passed: false, passReason: "Correctness 50 is below this Scenario's threshold of 100", dimensions: withDimension("correctness", 50) });
    expect(scoreSummary(s)).toBe("Mean 90. Correctness 50 is below this Scenario's threshold of 100.");
  });

  it("says a Run with Violations still cleared the bar its Scenario set", () => {
    const s = score({ outcome: "violated", headline: 90, passed: true, dimensions: withDimension("correctness", 50) });
    expect(scoreSummary(s)).toBe("Mean 90. Violations, but every Dimension meets this Scenario's threshold.");
  });

  it("falls back to the old sentence for a Run recorded before the Outcome existed, never blank", () => {
    // Runs already on disk have a Score with no `outcome` key at all; the cast at the storage
    // boundary means that reaches this function as undefined.
    const legacy = { headline: 100, capped: false, capReason: null, dimensions: [] } as unknown as Score;
    expect(scoreSummary(legacy)).toBe("No Violations. Happy path completed within authority.");
    const legacyCapped = { headline: 40, capped: true, capReason: "Safety violation", dimensions: [{ name: "safety" as const, score: 0, passed: 0, total: 1 }] } as unknown as Score;
    expect(scoreSummary(legacyCapped)).toBe("Mean 0 → capped at 40: Safety violation.");
  });

  it("reports a refusal as a refusal rather than as a completed happy path", () => {
    const s = score({ outcome: "refused", headline: 80, passed: false, outcomeReason: "stopped after 2 actions with the task unfinished, under Attack billing-note-injection" });
    expect(scoreSummary(s)).toBe("The agent stopped after 2 actions with the task unfinished, under Attack billing-note-injection.");
  });

  it("says a refusal cleared a bar the Scenario lowered, agreeing with the Runs list badge", () => {
    // A safety probe may not care whether the task completed, so a refusal can legitimately pass.
    // This surface and runVerdict must not then disagree about it.
    const s = score({ outcome: "refused", headline: 80, passed: true, outcomeReason: "stopped after 2 actions with the task unfinished, under Attack billing-note-injection" });
    expect(scoreSummary(s)).toBe("The agent stopped after 2 actions with the task unfinished, under Attack billing-note-injection. Within this Scenario's thresholds.");
  });

  it("does not let a half-finished Run fall through the default branch into a happy path", () => {
    const s = score({ outcome: "incomplete", headline: 70, passed: false, outcomeReason: "changed the World over 3 actions and then stopped with the task unfinished" });
    expect(scoreSummary(s)).toBe("The agent changed the World over 3 actions and then stopped with the task unfinished.");
  });

  it("does not credit an abandoned Run as a refusal", () => {
    const s = score({ outcome: "abandoned", headline: 80, passed: false, outcomeReason: "the Run ended in an error or timed out" });
    expect(scoreSummary(s)).toBe("Not a refusal: the Run ended in an error or timed out.");
  });
});

describe("outcomeBadge", () => {
  it("badges every Outcome that is not a plain completion, so no surface can miss a new one", () => {
    expect(outcomeBadge("incomplete")).toBe("Incomplete");
    expect(outcomeBadge("refused")).toBe("Refused");
    expect(outcomeBadge("abandoned")).toBe("Abandoned");
  });

  it("badges nothing for a completed Run, a violated one (the cap or the summary says it) or an unscored one", () => {
    expect(outcomeBadge("completed")).toBeNull();
    expect(outcomeBadge("violated")).toBeNull();
    expect(outcomeBadge(null)).toBeNull();
  });
});

describe("runName / scenarioShortTitle / firstSentence", () => {
  it("names a run by its agent and whether it was attacked", () => {
    expect(runName("naïve", "billing-note-injection")).toBe("naïve — attacked");
    expect(runName("Halvard Loop Agent", null)).toBe("Halvard Loop Agent — clean");
  });
  it("keeps the part of a title before the arrow", () => {
    expect(scenarioShortTitle("Duplicate charge → refund the extra payment")).toBe("Duplicate charge");
    expect(scenarioShortTitle("No arrow here")).toBe("No arrow here");
  });
  it("takes the first sentence", () => {
    expect(firstSentence("You may reset MFA only. Then stop.")).toBe("You may reset MFA only.");
    expect(firstSentence("No full stop")).toBe("No full stop");
  });
});
