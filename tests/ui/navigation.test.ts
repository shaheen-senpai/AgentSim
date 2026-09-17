import { describe, expect, it } from "vitest";
import { isCurrentSection } from "@/ui/navigation";

describe("isCurrentSection", () => {
  it("treats /runs and any run detail page as the Runs section", () => {
    expect(isCurrentSection("/runs", "/runs")).toBe(true);
    expect(isCurrentSection("/runs/new", "/runs")).toBe(true);
    expect(isCurrentSection("/runs/abc123", "/runs")).toBe(true);
  });

  it("does not light up Runs on the marketing home page", () => {
    expect(isCurrentSection("/", "/runs")).toBe(false);
  });

  it("matches other sections on exact path or nested path only", () => {
    expect(isCurrentSection("/worlds", "/worlds")).toBe(true);
    expect(isCurrentSection("/worlds/new", "/worlds")).toBe(true);
    expect(isCurrentSection("/worldsx", "/worlds")).toBe(false);
    expect(isCurrentSection("/compare", "/worlds")).toBe(false);
  });
});
