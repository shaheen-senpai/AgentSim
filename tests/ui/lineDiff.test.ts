import { describe, expect, it } from "vitest";
import { lineDiff } from "@/ui/lineDiff";

describe("lineDiff", () => {
  it("marks removed and added lines around a common subsequence", () => {
    expect(lineDiff("a\nb\nc", "a\nc\nd")).toEqual([
      { kind: "same", text: "a" }, { kind: "del", text: "b" }, { kind: "same", text: "c" }, { kind: "add", text: "d" },
    ]);
  });
  it("is all-same for identical input and all-add for a new document", () => {
    expect(lineDiff("x", "x")).toEqual([{ kind: "same", text: "x" }]);
    expect(lineDiff("", "y").filter((l) => l.kind === "add")).toEqual([{ kind: "add", text: "y" }]);
  });
});
