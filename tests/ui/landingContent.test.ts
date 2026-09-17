import { describe, expect, it } from "vitest";
import { ATTACKS, CTA, FEATURES, HERO, NAV, SECTION_IDS, WORLDS } from "@/marketing/content";

describe("landing content", () => {
  it("every nav anchor targets a section the page actually renders", () => {
    for (const item of NAV) {
      expect(item.href.startsWith("#")).toBe(true);
      expect(Object.values(SECTION_IDS)).toContain(item.href.slice(1));
    }
  });

  it("no CTA still says Book a demo; primary CTAs route to sign up", () => {
    const allCopy = JSON.stringify({ HERO, CTA, NAV });
    expect(allCopy).not.toMatch(/book a demo/i);
    expect(HERO.primary.href).toBe("/signup");
    expect(CTA.primary.href).toBe("/signup");
  });

  it("keeps the seven numbered infrastructure steps in order", () => {
    expect(FEATURES.map((f) => f.step)).toEqual(["01", "02", "03", "04", "05", "06"]);
    expect(ATTACKS).toHaveLength(3);
    expect(WORLDS).toHaveLength(3);
  });
});
