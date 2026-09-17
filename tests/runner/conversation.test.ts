import { describe, expect, it, vi } from "vitest";
import { converse } from "@/runner/conversation";
import type { ConversationTurn } from "@/runner/counterpart";

/** A customer that says each line in turn, then finishes. */
const scripted = (lines: string[]) => {
  let i = 0;
  return vi.fn(async () => (i < lines.length ? { message: lines[i++] } : ({ done: true } as const)));
};
const echoes = vi.fn(async (c: readonly ConversationTurn[]) => `re: ${c[c.length - 1].content}`);

describe("converse", () => {
  it("alternates customer and agent, oldest first", async () => {
    const out = await converse({ maxTurns: 6, ask: scripted(["one", "two"]), reply: echoes });
    expect(out).toEqual([
      { role: "counterpart", content: "one" },
      { role: "agent", content: "re: one" },
      { role: "counterpart", content: "two" },
      { role: "agent", content: "re: two" },
    ]);
  });

  it("stops as soon as the customer is finished, without calling the agent again", async () => {
    const reply = vi.fn(async () => "hello");
    await converse({ maxTurns: 6, ask: scripted(["only"]), reply });
    expect(reply).toHaveBeenCalledTimes(1);
  });

  it("stops at the turn cap, so a customer that never finishes cannot run forever", async () => {
    const endless = vi.fn(async () => ({ message: "again" }));
    const out = await converse({ maxTurns: 3, ask: endless, reply: echoes });
    expect(out.filter((t) => t.role === "counterpart")).toHaveLength(3);
    expect(endless).toHaveBeenCalledTimes(3);
  });

  it("shows the agent everything said so far, not just the last line", async () => {
    const seen: number[] = [];
    const reply = vi.fn(async (c: readonly ConversationTurn[]) => { seen.push(c.length); return "ok"; });
    await converse({ maxTurns: 6, ask: scripted(["a", "b"]), reply });
    expect(seen).toEqual([1, 3]); // the customer's turn is already appended when the agent is asked
  });

  it("returns nothing when the customer has nothing to say at all", async () => {
    expect(await converse({ maxTurns: 6, ask: scripted([]), reply: echoes })).toEqual([]);
  });
});

describe("converse — a turn that throws", () => {
  it("has already reported every turn that landed, so nothing said is lost", async () => {
    const seen: string[] = [];
    const reply = vi.fn(async () => { throw new Error("the agent went away"); });
    await expect(
      converse({ maxTurns: 6, ask: scripted(["hello"]), reply, onTurn: (t) => seen.push(`${t.role}:${t.content}`) }),
    ).rejects.toThrow(/went away/);
    expect(seen).toEqual(["counterpart:hello"]);
  });
});
