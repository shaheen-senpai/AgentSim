import { describe, expect, it } from "vitest";
import { loadProviderTools } from "@/engine/pack";
import type { EntitySpec, WorldPack } from "@/engine/pack";
import { runTool, ToolError } from "@/engine/dsl";
import { seedWorld } from "@/engine/world";
import type { Row } from "@/engine/types";

describe("slack provider catalog", () => {
  it("parses and exposes slack_get_channel_history and slack_post_message", () => {
    const tools = loadProviderTools("slack");
    expect(Object.keys(tools).sort()).toEqual(["slack_get_channel_history", "slack_post_message"]);
  });
});

/**
 * A minimal synthetic pack — employees + a messages collection — to run the real, YAML-loaded
 * `slack_get_channel_history`/`slack_post_message` tools through `runTool` and exercise their
 * `where`/`order_by` filtering and `lookup` failure path for real, not just confirm the YAML parses.
 */
function slackFixturePack(rows: { employees?: Row[]; messages?: Row[] }): WorldPack {
  const employees: EntitySpec = { label: "Employee", id_prefix: "emp_", owner: "self", fields: { id: { type: "string" }, name: { type: "string" } } };
  const messages: EntitySpec = {
    label: "Message", id_prefix: "msg_", owner: { via: "employee_id" },
    fields: {
      id: { type: "string" }, channel: { type: "string" }, author: { type: "string" },
      body: { type: "text" }, employee_id: { type: "string", ref: "employees" }, sent_at: { type: "string" },
    },
  };

  const { slack_get_channel_history, slack_post_message } = loadProviderTools("slack");

  return {
    meta: {
      id: "slack-fixture", name: "Slack Fixture", domain: "test", description: "test pack", principal: "employees", status: "ready", mandates: {},
      systems: { chat: { label: "Chat" } },
      entities: { employees, messages },
    },
    seed: {
      now: "2026-01-01T00:00:00Z",
      currency: "USD",
      rows: {
        employees: rows.employees ?? [{ id: "emp_1", name: "Priya" }],
        messages: rows.messages ?? [],
      },
    },
    tools: { slack_get_channel_history, slack_post_message },
    scenarios: [],
    agents: {},
    files: {},
  };
}

describe("slack_get_channel_history (via runTool, against a synthetic World)", () => {
  it("returns only the target channel's messages, in ascending sent_at order", () => {
    // #random's row sits earliest by sent_at and would sort first if the channel filter were
    // missing; #general's own rows are seeded out of order, so a passing assertion proves both
    // the `where: { channel }` filter (excludes msg_2) and the `order_by: sent_at` sort.
    const pack = slackFixturePack({
      messages: [
        { id: "msg_1", channel: "#general", author: "alice", body: "later", employee_id: "emp_1", sent_at: "2026-01-02T00:00:00Z" },
        { id: "msg_2", channel: "#random", author: "bob", body: "other channel", employee_id: "emp_1", sent_at: "2025-01-01T00:00:00Z" },
        { id: "msg_3", channel: "#general", author: "carol", body: "earlier", employee_id: "emp_1", sent_at: "2026-01-01T00:00:00Z" },
      ],
    });
    const w = seedWorld(pack);
    const r = runTool(pack, w, "slack_get_channel_history", { channel: "#general" });
    const value = JSON.parse(r.result) as { id: string }[];
    expect(value.map((m) => m.id)).toEqual(["msg_3", "msg_1"]);
    expect(r.changes).toEqual([]);
  });
});

describe("slack_post_message (via runTool, against a synthetic World)", () => {
  it("creates a message with the resolved employee_id and the hardcoded helpdesk author", () => {
    const pack = slackFixturePack({});
    const w = seedWorld(pack);
    const r = runTool(pack, w, "slack_post_message", { channel: "#general", employee_id: "emp_1", body: "hello there" });
    const created = w.collections.messages.at(-1)!;
    expect(created.channel).toBe("#general");
    expect(created.body).toBe("hello there");
    expect(created.employee_id).toBe("emp_1");
    expect(created.author).toBe("it-helpdesk-agent");
    expect(r.changes).toEqual([{ collection: "messages", id: created.id as string, op: "create" }]);
  });

  it("throws ToolError for an unknown employee_id and creates no message row", () => {
    const pack = slackFixturePack({});
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "slack_post_message", { channel: "#general", employee_id: "emp_999", body: "hi" })).toThrow(ToolError);
    expect(() => runTool(pack, w, "slack_post_message", { channel: "#general", employee_id: "emp_999", body: "hi" })).toThrow("No employee emp_999");
    expect(w.collections.messages).toHaveLength(0);
  });
});
