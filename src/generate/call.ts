// What both generation stages share: one forced tool call, mapped onto pack files, validated by
// the same `parsePackFiles` the editor and the API use, and retried once with the errors in the
// prompt. A draft that still fails is returned with its errors rather than thrown away — a human
// reviews every pack before it is created either way.
//
// The two stages are `./structure.ts` (what the World *is*, from the agent's own repo) and
// `./scenarios.ts` (what it is *tested with*, generated here on the platform).
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage, BetaTool } from "@anthropic-ai/sdk/resources/beta";
import { parsePackFiles, type PackFiles, type ValidationError } from "@/engine/pack";
import { loadFormatDoc } from "./formatDoc";

export const MODEL = "claude-opus-5";
export const MAX_ATTEMPTS = 2;
const MAX_TOKENS = 64_000;

export type GenerateResult = { files: PackFiles; errors: ValidationError[]; attempts: number };

/** A refinement of a draft that already exists: the change asked for, over the files it has now. */
export type Refinement = { note: string; previousFiles: PackFiles };

/** How hard the model works on one stage. `high` is the API default; a refinement needs less. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type Stage<T> = {
  /** The forced tool. Its name is what the reply is searched for. */
  tool: BetaTool;
  /**
   * Overrides the default `high`. A refinement re-emits files it was just shown, against a note
   * that usually touches a few lines — it does not need a cold draft's budget.
   */
  effort?: Effort;
  /** The tool's arguments, or a throw explaining what came back instead. */
  parse: (input: unknown) => T;
  /** The proposal as pack files, laid over the files the stage was given to build on. */
  toFiles: (proposal: T, base: PackFiles) => PackFiles;
  /** One attempt's prompt. `previousErrors` is set from the second attempt on. */
  prompt: (formatDoc: string, previousErrors?: ValidationError[]) => { system: string; user: string };
};

// ───────────────────────────── prompt fragments ─────────────────────────────

export function section(title: string, body: string | undefined): string {
  const text = body?.trim();
  return text ? `\n## ${title}\n\n${text}\n` : "";
}

export function errorList(errors: ValidationError[]): string {
  return errors.map((e) => `- ${e.file}${e.path ? ` · ${e.path}` : ""}: ${e.message}`).join("\n");
}

export function renderFiles(files: PackFiles): string {
  return Object.entries(files)
    .map(([name, text]) => `### ${name}\n\n${text}`)
    .join("\n\n");
}

/** The "your last draft did not validate" section, or "" on the first attempt. */
export function retrySection(previousErrors: ValidationError[] | undefined): string {
  if (!previousErrors || previousErrors.length === 0) return "";
  return [
    "",
    "## Your previous draft did not validate",
    "",
    "You already proposed this and the validator rejected it with the errors below. Produce the complete answer again — every file, in full — with every one of these fixed, and take care not to introduce new ones.",
    "",
    errorList(previousErrors),
  ].join("\n");
}

/** Collapses the blank runs left by omitted sections. */
export const tidy = (parts: string[]): string => parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();

// ───────────────────────────── the call ─────────────────────────────

function readProposal<T>(message: BetaMessage, toolName: string, parse: (input: unknown) => T): T {
  if (message.stop_reason === "refusal") {
    throw new Error("Generation refused: the model declined this request. Rephrase the description, or build the pack from a template instead.");
  }
  const block = message.content.find((b) => b.type === "tool_use" && b.name === toolName);
  if (!block || block.type !== "tool_use") {
    throw new Error(`Generation failed: the model stopped with '${message.stop_reason}' without calling ${toolName}.`);
  }
  return parse(block.input);
}

/**
 * Runs one stage: one call, and — if the result does not validate — one more with the errors in
 * the prompt. Always returns the last draft it got, valid or not, with whatever errors remain and
 * the number of model calls it took.
 */
export async function generate<T>(
  stage: Stage<T>,
  base: PackFiles,
  deps?: { client?: Anthropic; formatDoc?: string },
): Promise<GenerateResult> {
  const client = deps?.client ?? new Anthropic(); // ANTHROPIC_API_KEY from the environment
  const formatDoc = deps?.formatDoc ?? loadFormatDoc();

  let files: PackFiles = {};
  let errors: ValidationError[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { system, user } = stage.prompt(formatDoc, attempt === 1 ? undefined : errors);
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: stage.effort ?? "high" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // One cache breakpoint, at the end of the only part that never varies. The render order is
      // `tools` -> `system` -> `messages`, and for a given stage the tool schema and this whole
      // system prompt (~7.6k tokens, almost all of it the format doc) are byte-identical on every
      // call; every varying thing — the agent's manifest, a refinement note, the retry's error
      // list — is in the user message, after the breakpoint. So the retry below and every
      // `refine_world` read the prefix from cache instead of paying for it again. The 1h TTL is
      // deliberate: refinements arrive minutes apart, past the 5-minute default.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: user }],
      tools: [stage.tool],
      tool_choice: { type: "tool", name: stage.tool.name },
    });

    files = stage.toFiles(readProposal(await stream.finalMessage(), stage.tool.name, stage.parse), base);
    errors = parsePackFiles(files).errors;
    if (errors.length === 0) return { files, errors, attempts: attempt };
  }

  return { files, errors, attempts: MAX_ATTEMPTS };
}
