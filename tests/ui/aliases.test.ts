import { describe, expect, it } from "vitest";
import { draftErrors, formatAliases, parseAliases } from "@/ui/connect/aliases";

describe("parseAliases", () => {
  it("reads `their_name: our_tool` lines into the registry's record shape", () => {
    expect(parseAliases("fetch_ticket: get_ticket\nmail_customer: send_email")).toEqual({
      aliases: { fetch_ticket: "get_ticket", mail_customer: "send_email" },
      errors: [],
    });
  });

  it("ignores blank lines, comments and stray whitespace", () => {
    const { aliases, errors } = parseAliases("\n  # our names for their tools\n  fetch_ticket :  get_ticket  \n\n");
    expect(aliases).toEqual({ fetch_ticket: "get_ticket" });
    expect(errors).toEqual([]);
  });

  it("reports a line with no colon, and keeps the lines around it", () => {
    const { aliases, errors } = parseAliases("fetch_ticket: get_ticket\nnonsense\nmail: send_email");
    expect(aliases).toEqual({ fetch_ticket: "get_ticket", mail: "send_email" });
    expect(errors).toEqual(['Line 2: expected "their_name: our_tool".']);
  });

  it("reports an empty side of the colon", () => {
    expect(parseAliases("fetch_ticket:").errors).toEqual(["Line 1: both sides of the colon are required."]);
    expect(parseAliases(": get_ticket").errors).toEqual(["Line 1: both sides of the colon are required."]);
  });

  it("reports a repeated name rather than silently letting the last line win", () => {
    const { aliases, errors } = parseAliases("fetch_ticket: get_ticket\nfetch_ticket: get_order");
    expect(aliases).toEqual({ fetch_ticket: "get_ticket" });
    expect(errors).toEqual(["Line 2: 'fetch_ticket' is already mapped to 'get_ticket'."]);
  });

  it("is empty for empty input", () => {
    expect(parseAliases("")).toEqual({ aliases: {}, errors: [] });
  });
});

describe("formatAliases", () => {
  it("round-trips a record back to editable lines, in a stable order", () => {
    const aliases = { mail_customer: "send_email", fetch_ticket: "get_ticket" };
    expect(formatAliases(aliases)).toBe("fetch_ticket: get_ticket\nmail_customer: send_email");
    expect(parseAliases(formatAliases(aliases)).aliases).toEqual(aliases);
  });

  it("is empty for no aliases", () => {
    expect(formatAliases({})).toBe("");
  });
});

describe("draftErrors", () => {
  const ok = { name: "Acme Triage Bot", version: "2026.09.1", aliasText: "fetch_ticket: get_ticket" };

  it("passes a complete draft", () => {
    expect(draftErrors(ok)).toEqual([]);
  });

  it("requires a name and a version", () => {
    expect(draftErrors({ ...ok, name: "   " })).toContain("Give the agent a name.");
    expect(draftErrors({ ...ok, version: "" })).toContain("Give the agent a version.");
  });

  it("surfaces the alias errors alongside the field errors", () => {
    expect(draftErrors({ name: "", version: "", aliasText: "nonsense" })).toEqual([
      "Give the agent a name.",
      "Give the agent a version.",
      'Line 1: expected "their_name: our_tool".',
    ]);
  });
});
