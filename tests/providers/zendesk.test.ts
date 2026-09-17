import { describe, expect, it } from "vitest";
import { loadProviderTools } from "@/engine/pack";
import type { EntitySpec, WorldPack } from "@/engine/pack";
import { runTool } from "@/engine/dsl";
import { seedWorld } from "@/engine/world";
import type { Row } from "@/engine/types";

describe("zendesk provider catalog", () => {
  it("parses and exposes get_ticket and update_ticket", () => {
    const tools = loadProviderTools("zendesk");
    expect(Object.keys(tools).sort()).toEqual(["get_ticket", "update_ticket"]);
    expect(tools.update_ticket.input.status.optional).toBe(true);
    expect(tools.update_ticket.input.comment.optional).toBe(true);
  });
});

/**
 * A minimal synthetic pack — just enough of a ticket shape (status + notes) to run the real,
 * YAML-loaded `update_ticket` tool through `runTool` and exercise its `coalesce()`/`appendIfSet()`
 * optional-field logic for real, not just confirm the YAML parses.
 */
function zendeskFixturePack(ticketRow: Row): WorldPack {
  const tickets: EntitySpec = {
    label: "Ticket", id_prefix: "tkt_", owner: "self",
    fields: {
      id: { type: "string" },
      status: { type: "enum", values: ["new", "open", "pending", "hold", "solved", "closed"] },
      notes: { type: "string[]" },
    },
  };

  const updateTicket = loadProviderTools("zendesk").update_ticket;

  return {
    meta: {
      id: "zendesk-fixture", name: "Zendesk Fixture", domain: "test", description: "test pack", principal: "tickets", status: "ready", mandates: {},
      systems: { support: { label: "Support" } },
      entities: { tickets },
    },
    seed: { now: "2026-01-01T00:00:00Z", currency: "USD", rows: { tickets: [ticketRow] } },
    tools: { update_ticket: updateTicket },
    scenarios: [],
    agents: {},
    files: {},
  };
}

describe("update_ticket (via runTool, against a synthetic World)", () => {
  it("updates both status and notes when both status and comment are given", () => {
    const pack = zendeskFixturePack({ id: "tkt_1", status: "open", notes: ["first note"] });
    const w = seedWorld(pack);
    const r = runTool(pack, w, "update_ticket", { ticket_id: "tkt_1", status: "solved", comment: "fixed it" });
    expect(JSON.parse(r.result)).toEqual({ id: "tkt_1", status: "solved" });
    expect(w.collections.tickets[0]).toMatchObject({ status: "solved", notes: ["first note", "fixed it"] });
  });

  it("omitting comment leaves notes unchanged (appendIfSet passthrough)", () => {
    const pack = zendeskFixturePack({ id: "tkt_1", status: "open", notes: ["first note"] });
    const w = seedWorld(pack);
    const r = runTool(pack, w, "update_ticket", { ticket_id: "tkt_1", status: "pending" });
    expect(JSON.parse(r.result)).toEqual({ id: "tkt_1", status: "pending" });
    expect(w.collections.tickets[0]).toMatchObject({ status: "pending", notes: ["first note"] });
  });

  it("omitting status leaves status unchanged (coalesce falls through to current value)", () => {
    const pack = zendeskFixturePack({ id: "tkt_1", status: "open", notes: ["first note"] });
    const w = seedWorld(pack);
    const r = runTool(pack, w, "update_ticket", { ticket_id: "tkt_1", comment: "just a note" });
    expect(JSON.parse(r.result)).toEqual({ id: "tkt_1", status: "open" });
    expect(w.collections.tickets[0]).toMatchObject({ status: "open", notes: ["first note", "just a note"] });
  });
});
