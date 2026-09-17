import { beforeAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { createGateway } from "@/engine/gateway";
import { loadPack } from "@/engine/pack";
import { seedWorld } from "@/engine/world";
import { driveReferenceAgent } from "@/runner/referenceAgent";
import { copyFixturePacks } from "../helpers/packs";

type FakeBetaMessage = { id: string; usage: { input_tokens: number; output_tokens: number }; stop_reason: string; content: unknown[] };
type FakeRunnableTool = { name: string; run: (args: unknown, context?: { toolUse: { id: string; name: string; input: unknown } }) => Promise<string> };
type FakeToolRunnerParams = { tools: FakeRunnableTool[]; messages: unknown[] };

function fakeStream(message: FakeBetaMessage) {
  return { finalMessage: async () => message };
}

/** Builds a fake `client.beta.messages.toolRunner` that mimics the two things referenceAgent.ts
 * depends on from the real SDK (docs/research/anthropic-tool-runner.md §2, §5):
 *   - it yields one fake "stream" per assistant turn, *before* that turn's tools run;
 *   - between the first and second yield it runs two of the registered tools concurrently
 *     (Promise.all), the way the real runner executes one turn's tool_use blocks.
 */
function fakeClientWithConcurrentTools(msg1: FakeBetaMessage, msg2: FakeBetaMessage): Anthropic {
  return {
    beta: {
      messages: {
        toolRunner(params: FakeToolRunnerParams) {
          const getTicket = params.tools.find((t) => t.name === "get_ticket")!;
          const readThread = params.tools.find((t) => t.name === "get_thread")!;

          async function* iterate() {
            yield fakeStream(msg1);
            // Both calls happen after msg1's finalMessage() was awaited by the caller and before
            // msg2 is yielded — the real runner runs one turn's tool_use blocks with Promise.all.
            await Promise.all([
              getTicket.run({ ticket_id: "tkt_1001" }, { toolUse: { id: "tu_1", name: "get_ticket", input: {} } }),
              readThread.run({ thread_id: "thr_5001" }, { toolUse: { id: "tu_2", name: "get_thread", input: {} } }),
            ]);
            yield fakeStream(msg2);
          }

          return {
            [Symbol.asyncIterator]: iterate,
            params: { messages: params.messages },
            done: async () => msg2,
          };
        },
      },
    },
  } as unknown as Anthropic;
}

beforeAll(() => {
  copyFixturePacks();
});

describe("driveReferenceAgent", () => {
  it("stamps every tool call in an assistant turn with that turn's message id as batchId", async () => {
    const pack = loadPack("northwind");
    const gateway = createGateway(pack, seedWorld(pack));

    const msg1: FakeBetaMessage = { id: "msg_1", usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: "tool_use", content: [] };
    const msg2: FakeBetaMessage = { id: "msg_2", usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: "end_turn", content: [] };
    const client = fakeClientWithConcurrentTools(msg1, msg2);

    const result = await driveReferenceAgent(gateway, pack, "naive", "brief", undefined, { client });

    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
    expect(result.turns).toBe(2);
    expect(result.cappedOut).toBe(false);
    expect(result.truncated).toBe(false);

    expect(gateway.events).toHaveLength(2);
    const byTool = Object.fromEntries(gateway.events.map((e) => [e.tool, e]));
    expect(Object.keys(byTool).sort()).toEqual(["get_thread", "get_ticket"]);
    for (const e of gateway.events) {
      expect(e.batchId).toBe("msg_1");
      expect(e.source).toBe("reference");
    }
  });
});
