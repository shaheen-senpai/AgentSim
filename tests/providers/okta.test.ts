import { describe, expect, it } from "vitest";
import { loadProviderTools } from "@/engine/pack";
import type { EntitySpec, WorldPack } from "@/engine/pack";
import { runTool, ToolError } from "@/engine/dsl";
import { seedWorld } from "@/engine/world";
import type { Row } from "@/engine/types";

describe("okta provider catalog", () => {
  it("parses and exposes get_user, list_group_users, add_user_to_group, reset_factors", () => {
    const tools = loadProviderTools("okta");
    expect(Object.keys(tools).sort()).toEqual(["add_user_to_group", "get_user", "list_group_users", "reset_factors"]);
  });
});

/**
 * A minimal synthetic pack — Halvard's own directory/helpdesk entity shapes (employees, groups,
 * memberships, issues, mfa_resets) — to run the real, YAML-loaded `add_user_to_group` and
 * `reset_factors` tools through `runTool` and exercise their guard logic for real, not just
 * confirm the YAML parses.
 */
function oktaFixturePack(rows: { memberships?: Row[]; issues?: Row[]; mfa_resets?: Row[] }): WorldPack {
  const employees: EntitySpec = { label: "Employee", id_prefix: "emp_", owner: "self", fields: { id: { type: "string" }, name: { type: "string" } } };
  const groups: EntitySpec = {
    label: "Group", id_prefix: "grp_", owner: { via: "owner_id" },
    fields: { id: { type: "string" }, name: { type: "string" }, owner_id: { type: "string", ref: "employees" } },
  };
  const memberships: EntitySpec = {
    label: "Membership", id_prefix: "mem_", owner: { via: "employee_id" },
    fields: { id: { type: "string" }, employee_id: { type: "string", ref: "employees" }, group_id: { type: "string", ref: "groups" } },
  };
  const issues: EntitySpec = {
    label: "Issue", id_prefix: "HELP-", owner: { via: "requester_id" },
    fields: { id: { type: "string" }, requester_id: { type: "string", ref: "employees" }, status: { type: "string" } },
  };
  const mfaResets: EntitySpec = {
    label: "MFA reset", id_prefix: "mfa_", owner: { via: "employee_id" },
    fields: { id: { type: "string" }, employee_id: { type: "string", ref: "employees" }, created_at: { type: "string" } },
  };

  const { add_user_to_group, reset_factors } = loadProviderTools("okta");

  return {
    meta: {
      id: "okta-fixture", name: "Okta Fixture", domain: "test", description: "test pack", principal: "employees",
      systems: { directory: { label: "Directory" } },
      entities: { employees, groups, memberships, issues, mfa_resets: mfaResets },
    },
    seed: {
      now: "2026-01-01T00:00:00Z",
      currency: "USD",
      rows: {
        employees: [{ id: "emp_1", name: "Priya" }],
        groups: [{ id: "grp_1", name: "vpn-access", owner_id: "emp_1" }],
        memberships: rows.memberships ?? [],
        issues: rows.issues ?? [],
        mfa_resets: rows.mfa_resets ?? [],
      },
    },
    tools: { add_user_to_group, reset_factors },
    scenarios: [],
    agents: {},
    files: {},
  };
}

describe("add_user_to_group (via runTool, against a synthetic World)", () => {
  it("adds a user not already in the group and creates a memberships row", () => {
    const pack = oktaFixturePack({});
    const w = seedWorld(pack);
    const r = runTool(pack, w, "add_user_to_group", { user_id: "emp_1", group_id: "grp_1" });
    expect(JSON.parse(r.result)).toEqual({ ok: true, membership_id: "mem_0001", employee_id: "emp_1", group_id: "grp_1" });
    expect(r.changes).toEqual([{ collection: "memberships", id: "mem_0001", op: "create" }]);
    expect(w.collections.memberships[0]).toEqual({ id: "mem_0001", employee_id: "emp_1", group_id: "grp_1" });
  });

  it("rejects adding a user who is already a member, naming the employee and group", () => {
    const pack = oktaFixturePack({ memberships: [{ id: "mem_0001", employee_id: "emp_1", group_id: "grp_1" }] });
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "add_user_to_group", { user_id: "emp_1", group_id: "grp_1" })).toThrow(ToolError);
    expect(() => runTool(pack, w, "add_user_to_group", { user_id: "emp_1", group_id: "grp_1" }))
      .toThrow("emp_1 is already a member of vpn-access.");
  });
});

describe("reset_factors (via runTool, against a synthetic World)", () => {
  it("resets factors for a user with a helpdesk issue on record and no reset today, creating an mfa_resets row", () => {
    const pack = oktaFixturePack({ issues: [{ id: "HELP-1", requester_id: "emp_1", status: "Open" }] });
    const w = seedWorld(pack);
    const r = runTool(pack, w, "reset_factors", { user_id: "emp_1" });
    expect(JSON.parse(r.result)).toEqual({ ok: true, reset_id: "mfa_0001", employee_id: "emp_1" });
    expect(r.changes).toEqual([{ collection: "mfa_resets", id: "mfa_0001", op: "create" }]);
    expect(w.collections.mfa_resets[0]).toEqual({ id: "mfa_0001", employee_id: "emp_1", created_at: "2026-01-01T00:00:00Z" });
  });

  it("rejects a reset for a user with no helpdesk issue on record (first guard)", () => {
    const pack = oktaFixturePack({});
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "reset_factors", { user_id: "emp_1" })).toThrow(ToolError);
    expect(() => runTool(pack, w, "reset_factors", { user_id: "emp_1" }))
      .toThrow("No helpdesk issue on record for emp_1 — an MFA reset must be raised through the service desk first.");
  });

  it("rejects a reset for a user who already had a reset today (second guard)", () => {
    const pack = oktaFixturePack({
      issues: [{ id: "HELP-1", requester_id: "emp_1", status: "Open" }],
      mfa_resets: [{ id: "mfa_0001", employee_id: "emp_1", created_at: "2026-01-01T00:00:00Z" }],
    });
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "reset_factors", { user_id: "emp_1" })).toThrow(ToolError);
    expect(() => runTool(pack, w, "reset_factors", { user_id: "emp_1" }))
      .toThrow("MFA for emp_1 has already been reset today; a second reset needs IT Security sign-off.");
  });
});
