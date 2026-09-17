import { describe, expect, it } from "vitest";
import { erdLayout, ERD, ownedVia, ownershipChain } from "@/ui/worlds/ownership";
import type { EntitySpec } from "@/engine/pack";

const E: Record<string, EntitySpec> = {
  members: { label: "Member", owner: "self", fields: { id: { type: "string" } } },
  loans: { label: "Loan", owner: { via: "member_id" }, fields: { id: { type: "string" }, member_id: { type: "string", ref: "members" } } },
  notes: { label: "Note", owner: { via: "loan_id" }, fields: { id: { type: "string" }, loan_id: { type: "string", ref: "loans" }, body: { type: "text", untrusted: true } } },
};

describe("ownershipChain", () => {
  it("walks via/ref hops to the self-owned root", () => {
    expect(ownershipChain(E, "notes")).toEqual(["notes", "loans", "members"]);
    expect(ownershipChain(E, "members")).toEqual(["members"]);
    expect(ownedVia(E, "loans")).toBe("member_id");
    expect(ownedVia(E, "members")).toBe("—");
  });
  it("never loops on a bad pack", () => {
    const cyc: Record<string, EntitySpec> = {
      a: { label: "A", owner: { via: "b_id" }, fields: { b_id: { type: "string", ref: "b" } } },
      b: { label: "B", owner: { via: "a_id" }, fields: { a_id: { type: "string", ref: "a" } } },
    };
    expect(ownershipChain(cyc, "a").length).toBeLessThanOrEqual(3);
    expect(ownershipChain(E, "ghost")).toEqual(["ghost"]);
  });
});

describe("erdLayout", () => {
  it("places one column per depth, roots first, and one edge per via hop", () => {
    const l = erdLayout(E);
    expect(l.nodes.map((n) => [n.name, n.depth])).toEqual([["members", 0], ["loans", 1], ["notes", 2]]);
    expect(l.nodes[0].root).toBe(true);
    expect(l.nodes[1].x - l.nodes[0].x).toBe(ERD.NW + ERD.GAPX);
    expect(l.edges.map((e) => `${e.from}->${e.to}:${e.via}`)).toEqual(["loans->members:member_id", "notes->loans:loan_id"]);
    expect(l.width).toBe(ERD.PAD * 2 + 3 * ERD.NW + 2 * ERD.GAPX);
    expect(l.height).toBe(ERD.PAD * 2 + ERD.NH);
  });
  it("stacks the entities that share a depth and centres shorter columns", () => {
    const two: Record<string, EntitySpec> = {
      ...E,
      tags: { label: "Tag", owner: { via: "member_id" }, fields: { member_id: { type: "string", ref: "members" } } },
    };
    const l = erdLayout(two);
    const depth1 = l.nodes.filter((n) => n.depth === 1);
    expect(depth1).toHaveLength(2);
    expect(depth1[1].y - depth1[0].y).toBe(ERD.NH + ERD.GAPY);
    expect(l.height).toBe(ERD.PAD * 2 + 2 * ERD.NH + ERD.GAPY);
    const root = l.nodes.find((n) => n.name === "members")!;
    expect(root.y).toBe(ERD.PAD + (ERD.NH + ERD.GAPY) / 2);
  });
});
