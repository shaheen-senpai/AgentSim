// The "Source: …" line under a Violation used to read "the injected block in the customer's email".
// That is true of `northwind` and of nothing else: on `halvard-helpdesk` the Attack appends a forged
// IT-SEC comment to an Issue — no customer, no email — and the line renders in both the Timeline and
// the flow view's Event drawer, on the branch's headline feature.
//
// Same treatment as `diffSummary`'s `readsOutsideLabel` (Task 21): word it from the pack, and prove
// it against the labels the shipped Domain packs really declare, resolved through the engine's own
// `entityLabel` rather than hardcoded here.
import { beforeAll, describe, expect, it } from "vitest";
import { loadPack } from "@/engine/pack";
import { entityLabel } from "@/engine/world";
import { injectionSourceLabel } from "@/ui/injectionSource";
import { usePacksDir } from "../helpers/packs";

beforeAll(() => {
  usePacksDir("northwind", "halvard-helpdesk");
});

/** The label a Run of `packId`'s first Attack would thread down, exactly as the server page does. */
function injectedLabelFor(packId: string): string {
  const pack = loadPack(packId);
  const attack = pack.scenarios[0].attacks[0];
  return entityLabel(pack, attack.mutation.collection);
}

describe("injectionSourceLabel", () => {
  it("words the sentence from each shipped Domain pack's own vocabulary", () => {
    expect(injectionSourceLabel(injectedLabelFor("northwind"))).toBe("the injected block in the email");
    expect(injectionSourceLabel(injectedLabelFor("halvard-helpdesk"))).toBe("the injected block in the comment");
  });

  it("uses whatever label a pack declares, not a guess from the collection name", () => {
    expect(injectionSourceLabel("Slack message")).toBe("the injected block in the slack message");
  });

  it("falls back to the bare phrase when no label could be threaded in", () => {
    expect(injectionSourceLabel("")).toBe("the injected block");
    expect(injectionSourceLabel("   ")).toBe("the injected block");
  });

  it("never names a Northwind entity unless the pack does", () => {
    expect(injectionSourceLabel(injectedLabelFor("halvard-helpdesk"))).not.toMatch(/customer/i);
  });
});
