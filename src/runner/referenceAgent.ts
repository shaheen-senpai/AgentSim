import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta";
import type { Gateway } from "@/engine/gateway";
import { inputZod, type WorldPack } from "@/engine/pack";
import { loadSystemPrompt, REFERENCE_AGENT_MODEL } from "./agents";

export const MAX_ITERATIONS = 16; // API requests per Run; the capped turn's tools still execute (research §5)
export const MAX_TOKENS = 16_000;

export type DriveResult = {
  usage: { inputTokens: number; outputTokens: number };
  transcript: unknown[];
  cappedOut: boolean;
  truncated: boolean;
  turns: number;
};

/** Runs the Reference Agent against a live gateway. Every tool call is routed through gateway.execute, which records the Event. */
export async function driveReferenceAgent(
  gateway: Gateway,
  pack: WorldPack,
  version: string,
  taskBrief: string,
  onTurn?: (usage: DriveResult["usage"]) => void,
  deps?: { client?: Anthropic },
): Promise<DriveResult> {
  const client = deps?.client ?? new Anthropic({ maxRetries: 3 }); // ANTHROPIC_API_KEY from the environment

  // The runner executes one assistant turn's tool_use blocks concurrently (Promise.all) after
  // yielding that turn's stream and before yielding the next one (research doc §2, §5) — so each
  // tool's `run` closure reads `currentBatch` at call time, and the loop below stamps it right
  // after the turn's message id is known, before the tools for that turn run.
  let currentBatch: string | null = null;
  const tools = Object.values(pack.tools).map((def) =>
    betaZodTool({
      name: def.name,
      description: def.description,
      inputSchema: inputZod(def),
      // ToolError thrown by gateway.execute becomes a tool_result with is_error: true — the loop continues.
      run: async (args, context) => gateway.execute({ tool: def.name, input: args, toolUseId: context?.toolUse.id, source: "reference", batchId: currentBatch }),
    }),
  );

  // Haiku 4.5: no thinking / output_config / fallbacks (ticket 03, Global Constraints).
  const runner = client.beta.messages.toolRunner({
    model: REFERENCE_AGENT_MODEL,
    max_tokens: MAX_TOKENS,
    system: loadSystemPrompt(pack, version),
    tools,
    messages: [{ role: "user", content: taskBrief }],
    max_iterations: MAX_ITERATIONS,
    stream: true,
  });

  const usage = { inputTokens: 0, outputTokens: 0 };
  let turns = 0;
  for await (const stream of runner) {
    turns++;
    const message: BetaMessage = await stream.finalMessage();
    currentBatch = message.id; // stamps the tools the runner executes after this yield, before the next one
    usage.inputTokens += message.usage.input_tokens;
    usage.outputTokens += message.usage.output_tokens;
    onTurn?.({ ...usage });
  }
  const final = await runner.done();

  return {
    usage,
    transcript: structuredClone(runner.params.messages) as unknown[],
    cappedOut: final.stop_reason === "tool_use",
    truncated: final.stop_reason === "max_tokens",
    turns,
  };
}
