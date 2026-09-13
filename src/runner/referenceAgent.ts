import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta";
import type { Sim } from "@/sim/sim";
import { TOOLS } from "@/sim/tools";
import { loadSystemPrompt, REFERENCE_AGENT_MODEL, type AgentVersion } from "./agents";

export const MAX_ITERATIONS = 16; // API requests per Run; the capped turn's tools still execute (research §5)
export const MAX_TOKENS = 16_000;

export type DriveResult = {
  usage: { inputTokens: number; outputTokens: number };
  transcript: unknown[];
  cappedOut: boolean;
  truncated: boolean;
  turns: number;
};

/** Runs the Reference Agent against a live Sim. Every tool call is routed through sim.execute, which records the Event. */
export async function driveReferenceAgent(
  sim: Sim,
  agent: AgentVersion,
  taskBrief: string,
  onTurn?: (usage: DriveResult["usage"]) => void,
): Promise<DriveResult> {
  const client = new Anthropic({ maxRetries: 3 }); // ANTHROPIC_API_KEY from the environment

  const tools = TOOLS.map((def) =>
    betaZodTool({
      name: def.name,
      description: def.description,
      inputSchema: def.schema,
      // ToolError thrown by sim.execute becomes a tool_result with is_error: true — the loop continues.
      run: async (args, context) => sim.execute(def.name, args, context?.toolUse.id),
    }),
  );

  // Haiku 4.5: no thinking / output_config / fallbacks (ticket 03, Global Constraints).
  const runner = client.beta.messages.toolRunner({
    model: REFERENCE_AGENT_MODEL,
    max_tokens: MAX_TOKENS,
    system: loadSystemPrompt(agent),
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
