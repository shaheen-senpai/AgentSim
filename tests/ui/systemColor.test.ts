import { describe, expect, it } from "vitest";
import { systemColor } from "@/ui/systemColor";

describe("systemColor", () => {
  it("is stable by a system's index in the sorted list, regardless of the array's own order", () => {
    const a = systemColor(["orders", "email", "support"], "email"); // sorted: email, orders, support -> index 0
    const b = systemColor(["support", "orders", "email"], "email");
    expect(a).toEqual(b);
  });

  it("gives different systems different colours", () => {
    const systems = ["email", "orders", "support"];
    const email = systemColor(systems, "email");
    const orders = systemColor(systems, "orders");
    const support = systemColor(systems, "support");
    expect(new Set([email.fg, orders.fg, support.fg]).size).toBe(3);
  });

  it("cycles through the 8-hue palette past 8 systems", () => {
    const systems = Array.from({ length: 9 }, (_, i) => `sys${i}`); // lexical order === numeric order here
    expect(systemColor(systems, "sys8").fg).toBe(systemColor(systems, "sys0").fg);
    expect(systemColor(systems, "sys1").fg).not.toBe(systemColor(systems, "sys0").fg);
  });

  it("gives an unknown system a neutral grey", () => {
    const c = systemColor(["email", "orders"], "nonexistent");
    expect(c.fg).toBe("#6b6b66");
    expect(c.stripe).toBe("#6b6b66");
  });

  it("derives bg as a light tint of the hue, distinct from fg", () => {
    const c = systemColor(["email"], "email");
    expect(c.stripe).toBe(c.fg);
    expect(c.bg).not.toBe(c.fg);
    expect(c.bg.toLowerCase()).not.toBe("#ffffff");
  });
});
