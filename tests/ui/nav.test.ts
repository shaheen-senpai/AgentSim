import { describe, expect, it } from "vitest";
import { activeNav } from "@/ui/nav";

describe("activeNav", () => {
  it("maps every route family onto its sidebar item", () => {
    expect(activeNav("/")).toBeNull(); // the marketing landing page belongs to no console section
    expect(activeNav("/agents")).toBe("agents");
    expect(activeNav("/agents/agt_x")).toBe("agents");
    expect(activeNav("/runs")).toBe("runs");
    expect(activeNav("/runs/run_abc")).toBe("runs");
    expect(activeNav("/runs/new")).toBe("wizard");
    expect(activeNav("/compare")).toBe("compare");
    expect(activeNav("/compare?a=x")).toBe("compare");
    expect(activeNav("/worlds")).toBe("world");
    expect(activeNav("/worlds/northwind/edit")).toBe("world");
    expect(activeNav("/nothing")).toBeNull();
  });
});
