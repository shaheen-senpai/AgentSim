import { describe, expect, it } from "vitest";
import { conversationOf } from "@/ui/AgentReplyPanel";
import type { RunRecord } from "@/ui/types";

const run = (transcript: unknown[]) => ({ transcript } as RunRecord);

describe("conversationOf", () => {
  it("reads the exchange a driven Run recorded, oldest first", () => {
    const turns = [
      { role: "counterpart", content: "I was charged twice." },
      { role: "agent", content: "All sorted." },
    ];
    expect(conversationOf(run(turns))).toEqual(turns);
  });

  it("is empty for a Run that was not driven, so the panel stays off", () => {
    expect(conversationOf(run([]))).toEqual([]);
    expect(conversationOf(null)).toEqual([]);
  });

  it("ignores a transcript from some other source rather than guessing at its shape", () => {
    // A Reference Run's transcript is the provider's own message array, not our turns.
    expect(conversationOf(run([{ role: "assistant", content: [{ type: "text", text: "hi" }] }]))).toEqual([]);
    expect(conversationOf(run(["not an object"]))).toEqual([]);
  });
});
