import { describe, expect, it } from "vitest";
import { activeNav } from "@/ui/nav";

describe("activeNav", () => {
  it("maps every route family onto its sidebar item", () => {
    expect(activeNav("/")).toBe("runs");
    expect(activeNav("/runs/run_abc")).toBe("runs");
    expect(activeNav("/runs/new")).toBe("wizard");
    expect(activeNav("/compare")).toBe("compare");
    expect(activeNav("/compare?a=x")).toBe("compare");
    expect(activeNav("/worlds")).toBe("world");
    expect(activeNav("/worlds/northwind/edit")).toBe("world");
    expect(activeNav("/nothing")).toBeNull();
  });
});
