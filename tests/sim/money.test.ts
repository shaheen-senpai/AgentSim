import { describe, expect, it } from "vitest";
import { fmtMoney } from "@/sim/money";

describe("fmtMoney", () => {
  it("formats minor units as GBP", () => {
    expect(fmtMoney(4999)).toBe("£49.99");
    expect(fmtMoney(12000)).toBe("£120.00");
    expect(fmtMoney(5)).toBe("£0.05");
    expect(fmtMoney(-250)).toBe("-£2.50");
  });
  it("falls back to the currency code", () => {
    expect(fmtMoney(100, "EUR")).toBe("EUR 1.00");
  });
});
