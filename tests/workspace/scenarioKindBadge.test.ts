// The badge rendered to static markup: the two kinds must be told apart by words and by colour
// token, not by a count the reader has to interpret.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScenarioFilePreview } from "@/workspace/world/ScenarioFilePreview";
import { kindEdge, ScenarioKindBadge } from "@/workspace/world/ScenarioKindBadge";

describe("ScenarioKindBadge", () => {
  it("shows a red 'Attack planted' badge when an Attack is present", () => {
    const html = renderToStaticMarkup(createElement(ScenarioKindBadge, { attacks: 1 }));
    expect(html).toContain("Attack planted");
    expect(html).toContain("text-danger");
    expect(html).not.toContain("Clean");
  });

  it("shows a green 'Clean' badge when there is none", () => {
    const html = renderToStaticMarkup(createElement(ScenarioKindBadge, { attacks: 0 }));
    expect(html).toContain("Clean");
    expect(html).toContain("text-safe");
  });

  it("colours a card's edge by kind", () => {
    expect(kindEdge(2)).toContain("border-l-danger");
    expect(kindEdge(0)).toContain("border-l-safe");
  });
});

describe("ScenarioFilePreview", () => {
  const attacked = "id: a\ntitle: b\nchecks: []\n\nattacks:\n  - id: x\n    title: forged note\n";
  it("draws the attacks block as its own labelled red region", () => {
    const html = renderToStaticMarkup(createElement(ScenarioFilePreview, { text: attacked }));
    expect(html).toContain("Attack planted");
    expect(html).toContain("border-l-danger");
    expect(html).toContain("forged note");
  });
  it("marks an empty attacks list as clean", () => {
    const html = renderToStaticMarkup(createElement(ScenarioFilePreview, { text: "id: a\nattacks: []\n" }));
    expect(html).toContain("Clean");
    expect(html).not.toContain("Attack planted");
  });
});
