import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { setMandateText, withBuiltBy, withPackStatus } from "@/ui/worlds/packEdits";

const PACK = `id: northwind                              # must equal the folder name
name: Northwind Outfitters
principal: customers
mandates:
  refund-limits:
    title: Refund limits
    text: |
      Refund only a duplicate charge.
`;

describe("withPackStatus", () => {
  it("sets the status and leaves every comment and other field alone", () => {
    const out = withPackStatus(PACK, "draft");
    expect(parse(out).status).toBe("draft");
    expect(out).toContain("# must equal the folder name");
    expect(out).toContain("name: Northwind Outfitters");
  });

  it("replaces an existing status — publishing is the same write as drafting", () => {
    expect(parse(withPackStatus(withPackStatus(PACK, "draft"), "ready")).status).toBe("ready");
  });

  it("works on a pack.yaml that is empty, rather than throwing on the way to validation", () => {
    expect(parse(withPackStatus("", "draft"))).toEqual({ status: "draft" });
  });
});

describe("withBuiltBy", () => {
  it("records the build as a block mapping, without disturbing the rest", () => {
    const out = withBuiltBy(PACK, { source: "plugin", run: "draft_7b40de", token: "wb_3ac81f52", client: "claude-code 2.0.9", repo: "github.com/acme/bot@a1b2c3d", at: "2026-09-18T10:04:00Z" });
    expect(parse(out).built_by).toEqual({
      source: "plugin",
      run: "draft_7b40de",
      token: "wb_3ac81f52",
      client: "claude-code 2.0.9",
      repo: "github.com/acme/bot@a1b2c3d",
      at: "2026-09-18T10:04:00Z",
    });
    expect(out).toContain("# must equal the folder name");
  });

  it("overwrites an earlier build rather than stacking two", () => {
    const once = withBuiltBy(PACK, { source: "console", at: "2026-09-17T00:00:00Z" });
    const twice = withBuiltBy(once, { source: "plugin", at: "2026-09-18T00:00:00Z" });
    expect(parse(twice).built_by).toEqual({ source: "plugin", at: "2026-09-18T00:00:00Z" });
  });
});

describe("setMandateText", () => {
  it("rewrites one Mandate's text as a block scalar", () => {
    const out = setMandateText(PACK, "refund-limits", "Refund only a duplicate charge, up to the amount duplicated.");
    expect(parse(out).mandates["refund-limits"]).toEqual({
      title: "Refund limits",
      text: "Refund only a duplicate charge, up to the amount duplicated.\n",
    });
    expect(out).toContain("text: |");
  });

  it("leaves the file untouched when the Mandate is not declared", () => {
    expect(setMandateText(PACK, "no-such-mandate", "x")).toBe(PACK);
  });
});

// The generator stamps `status: draft` through `withPackStatus` *before* the draft is validated, so
// a model reply that is not YAML used to throw "Document with errors cannot be stringified" out of
// the retry loop — spending the operator's build token on a fault the second attempt could have
// fixed. Every editor here now passes an unparseable file through untouched, for
// `parsePackFiles` to report with a line number.
describe("unparseable pack.yaml", () => {
  const BROKEN = "id: northwind\nmandates:\n  bad:\n    text: naked: colon: in: a: scalar\n  { unclosed flow\n";

  it("leaves it alone rather than throwing", () => {
    expect(withPackStatus(BROKEN, "draft")).toBe(BROKEN);
    expect(withBuiltBy(BROKEN, { source: "plugin", at: "2026-09-18T10:04:00Z" })).toBe(BROKEN);
    expect(setMandateText(BROKEN, "bad", "replacement")).toBe(BROKEN);
  });
});
