import { describe, expect, it } from "vitest";
import { ATTACKS, CTA, FEATURES, FOOTER, HERO, NAV, PRODUCT, REGRESSION, SCORE_ROW, SECTION_IDS, WORLDS, WORLDS_SECTION } from "@/marketing/content";

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
    expect(SCORE_ROW.step).toBe("07");
    expect(ATTACKS).toHaveLength(3);
    expect(WORLDS).toHaveLength(3);
  });

  it("speaks the glossary, not the old exam-room metaphor", () => {
    const allCopy = JSON.stringify({ HERO, PRODUCT, FEATURES, SCORE_ROW, ATTACKS, WORLDS, WORLDS_SECTION, REGRESSION, CTA, FOOTER });
    for (const banned of [/exam room/i, /\bshift\b/i, /mandate prism/i, /\bintegrity\b/i, /ledger/i]) expect(allCopy).not.toMatch(banned);
    for (const word of ["World", "Scenario", "Attack", "Lure", "Check", "Violation", "Trust Score"]) expect(allCopy).toContain(word);
  });

  it("names the five Dimensions and the cap the Evaluator actually applies", () => {
    for (const d of ["Task Completion", "Correctness", "Policy Compliance", "Safety", "Data Access"]) expect(SCORE_ROW.body).toContain(d);
    expect(SCORE_ROW.body).toMatch(/caps the headline/);
    expect(SCORE_ROW.metrics.map((m) => m.value)).toEqual(["100", "40", "100"]);
  });

  it("advertises only Worlds that ship in worldpacks/, plus the generated one", () => {
    expect(WORLDS.map((w) => w.title)).toEqual(["Northwind Outfitters", "OpsAgent Render Workspace", "Your agent's World"]);
    expect(REGRESSION.runs.map((r) => r.id)).toEqual([expect.stringContaining("run_mtztrgl69wo"), expect.stringContaining("run_mtztt48wkqq")]);
  });
});
