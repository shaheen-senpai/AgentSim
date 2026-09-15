// The generator, without the network. Every model call here comes from a fake client: the tests
// prove what `buildPrompt` puts in front of the model and that the validate-and-retry loop really
// re-prompts with the errors — never that the API works.
import { beforeAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { POST as generateRoute } from "@/app/api/worlds/generate/route";
import { loadPack, parsePackFiles, type PackFiles, type ValidationError } from "@/engine/pack";
import { examplePackFiles, loadFormatDoc } from "@/generate/formatDoc";
import { buildPrompt, generateWorldPack, MAX_ATTEMPTS, PROPOSE_TOOL, TOOL_NAME, type GenerateInput } from "@/generate/worldpack";
import { usePacksDir } from "../helpers/packs";

// ───────────────────────────── the fake client ─────────────────────────────

type StreamParams = {
  system: string;
  messages: { role: string; content: string }[];
  tools: { name: string }[];
  tool_choice: { type: string; name?: string };
};

type FakeMessage = { stop_reason: string; content: { type: string; name?: string; input?: unknown }[] };

const proposal = (files: PackFiles, scenarioIds: string[], agentVersions: string[]) => ({
  pack_yaml: files["pack.yaml"],
  seed_yaml: files["seed.yaml"],
  tools_yaml: files["tools.yaml"],
  scenarios: scenarioIds.map((id) => ({ id, yaml: files[`scenarios/${id}.yaml`] })),
  agents: agentVersions.map((version) => ({ version, markdown: files[`agents/${version}.md`] })),
});

const toolUse = (input: unknown): FakeMessage => ({ stop_reason: "tool_use", content: [{ type: "tool_use", name: TOOL_NAME, input }] });

/** Replies with `replies[n]` to the n-th call, recording every request in `calls`. */
function fakeClient(replies: FakeMessage[], calls: StreamParams[]): Anthropic {
  return {
    beta: {
      messages: {
        stream(params: StreamParams) {
          calls.push(params);
          const reply = replies[calls.length - 1];
          if (!reply) throw new Error(`fake client: unexpected call #${calls.length}`);
          return { finalMessage: async () => reply };
        },
      },
    },
  } as unknown as Anthropic;
}

// ───────────────────────────── fixtures ─────────────────────────────

const INPUT: GenerateInput = {
  name: "Halvard Helpdesk",
  domain: "it-helpdesk",
  description: "An internal IT helpdesk: employees raise tickets, agents grant access and reset devices.",
  schema: "CREATE TABLE tickets (id text primary key, employee_id text references employees(id));",
  tools: "get_ticket, grant_access, reset_device",
  openapi: "openapi: 3.1.0",
};

let northwind: PackFiles;
let formatDoc: string;

beforeAll(() => {
  usePacksDir();
  northwind = loadPack("northwind").files;
  formatDoc = loadFormatDoc();
});

// ══════════════════════════════════════════════════════════════════════════

describe("docs/worldpack-format.md", () => {
  it("embeds a complete example pack that actually validates", () => {
    const files = examplePackFiles(formatDoc);

    expect(Object.keys(files).sort()).toEqual([
      "agents/desk.md",
      "pack.yaml",
      "scenarios/renew-a-members-loan.yaml",
      "seed.yaml",
      "tools.yaml",
    ]);

    const { pack, errors } = parsePackFiles(files);
    expect(errors).toEqual([]);
    expect(pack).not.toBeNull();
    // The rules the doc itself lays down for a pack worth running.
    expect(pack!.seed.rows[pack!.meta.principal].length).toBeGreaterThanOrEqual(3);
    expect(pack!.scenarios.length).toBeGreaterThanOrEqual(1);
    expect(pack!.scenarios[0].attacks.length).toBeGreaterThanOrEqual(1);
  });
});

describe("buildPrompt", () => {
  it("puts the whole format doc and every input in front of the model", () => {
    const { system, user } = buildPrompt(INPUT, formatDoc);

    expect(system).toContain(formatDoc.trim());
    expect(system).toContain("Schema only, never real data");
    expect(system).toContain(TOOL_NAME);

    expect(user).toContain(INPUT.name);
    expect(user).toContain(INPUT.domain);
    expect(user).toContain(INPUT.description);
    expect(user).toContain(INPUT.schema!);
    expect(user).toContain(INPUT.tools!);
    expect(user).toContain(INPUT.openapi!);
    expect(user).not.toContain("did not validate");
  });

  it("omits the optional sections that were not given", () => {
    const { user } = buildPrompt({ name: "A", domain: "b", description: "c" }, formatDoc);
    expect(user).not.toContain("## Database schema");
    expect(user).not.toContain("## Tool list");
    expect(user).not.toContain("## OpenAPI specification");
  });

  it("lists the previous draft's validation errors when there are some", () => {
    const previous: ValidationError[] = [
      { file: "tools.yaml", path: "tools.grant_access.system", message: "system 'access' is not declared in pack.yaml systems" },
      { file: "seed.yaml", path: "rows.tickets[0].id", message: "row t1 in tickets must start with tkt_" },
    ];
    const { user } = buildPrompt(INPUT, formatDoc, previous);

    expect(user).toContain("did not validate");
    for (const e of previous) {
      expect(user).toContain(e.file);
      expect(user).toContain(e.path);
      expect(user).toContain(e.message);
    }
  });

  it("shows the current draft and the requested change when refining", () => {
    const previousFiles = { "pack.yaml": "id: acme\nname: Acme\n", "tools.yaml": "get_ticket:\n  system: support\n" };
    const { user } = buildPrompt(INPUT, formatDoc, undefined, { note: "Add a Stripe-like payments system.", previousFiles });

    expect(user).toContain("## Current draft");
    expect(user).toContain("pack.yaml");
    expect(user).toContain(previousFiles["pack.yaml"]);
    expect(user).toContain("tools.yaml");
    expect(user).toContain(previousFiles["tools.yaml"]);
    expect(user).toContain("## Requested change");
    expect(user).toContain("Add a Stripe-like payments system.");
  });

  it("carries both a refinement and validation errors when both are present", () => {
    const previousFiles = { "pack.yaml": "id: acme\n" };
    const errors: ValidationError[] = [{ file: "tools.yaml", path: "", message: "system 'nope' is not declared" }];
    const { user } = buildPrompt(INPUT, formatDoc, errors, { note: "add refunds", previousFiles });

    expect(user).toContain("## Current draft");
    expect(user).toContain("## Requested change");
    expect(user).toContain("did not validate");
    expect(user).toContain("system 'nope' is not declared");
  });

  it("omits the current-draft section when there is no refinement", () => {
    const { user } = buildPrompt(INPUT, formatDoc);
    expect(user).not.toContain("## Current draft");
    expect(user).not.toContain("## Requested change");
  });

  it("names payments/messaging/email/storage dependencies as their own system, with a worked shape", () => {
    const { system } = buildPrompt(INPUT, formatDoc);
    expect(system).toContain("Stripe");
    expect(system).toContain("issue_refund");
    expect(system).toMatch(/refund.*exceed|balance/i);
  });
});

describe("generateWorldPack", () => {
  it("retries once with the validation errors, and returns the second, valid draft", async () => {
    const calls: StreamParams[] = [];
    const broken = { ...proposal(northwind, ["duplicate-charge-refund"], ["naive", "fixed"]), tools_yaml: "get_ticket:\n  system: nope\n" };
    const client = fakeClient([toolUse(broken), toolUse(proposal(northwind, ["duplicate-charge-refund"], ["naive", "fixed"]))], calls);

    const result = await generateWorldPack(INPUT, { client, formatDoc });

    expect(result.attempts).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.files).toEqual(northwind);

    // Two calls; the first carries no error report, the second carries the first draft's errors.
    expect(calls).toHaveLength(2);
    expect(calls[0].messages[0].content).not.toContain("did not validate");
    expect(calls[1].messages[0].content).toContain("did not validate");
    expect(calls[1].messages[0].content).toContain("tools.yaml");

    // The structured-output contract: one forced tool, same schema every time.
    for (const call of calls) {
      expect(call.tools).toEqual([PROPOSE_TOOL]);
      expect(call.tool_choice).toEqual({ type: "tool", name: TOOL_NAME });
    }
  });

  it("returns the draft and its remaining errors when the retry still does not validate", async () => {
    const calls: StreamParams[] = [];
    const broken = { ...proposal(northwind, ["duplicate-charge-refund"], ["naive"]), tools_yaml: "get_ticket:\n  system: nope\n" };
    const client = fakeClient([toolUse(broken), toolUse(broken)], calls);

    const result = await generateWorldPack(INPUT, { client, formatDoc });

    expect(result.attempts).toBe(MAX_ATTEMPTS);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every((e) => e.file === "tools.yaml")).toBe(true);
    expect(result.files["tools.yaml"]).toBe(broken.tools_yaml); // the draft is still handed back for a human to fix
  });

  it("stops on the first call when the first draft validates", async () => {
    const calls: StreamParams[] = [];
    const client = fakeClient([toolUse(proposal(northwind, ["duplicate-charge-refund"], ["naive", "fixed"]))], calls);

    const result = await generateWorldPack(INPUT, { client, formatDoc });

    expect(result).toEqual({ files: northwind, errors: [], attempts: 1 });
    expect(calls).toHaveLength(1);
  });

  it("throws a clear error when the model refuses", async () => {
    const client = fakeClient([{ stop_reason: "refusal", content: [] }], []);
    await expect(generateWorldPack(INPUT, { client, formatDoc })).rejects.toThrow(/refused/i);
  });

  it("throws when the model stops without calling the tool", async () => {
    const client = fakeClient([{ stop_reason: "end_turn", content: [{ type: "text" }] }], []);
    await expect(generateWorldPack(INPUT, { client, formatDoc })).rejects.toThrow(/without calling propose_world_pack/);
  });
});

describe("generateWorldPack with a refinement", () => {
  it("passes the draft's current files and the note through to buildPrompt's user message", async () => {
    const calls: StreamParams[] = [];
    const client = fakeClient([toolUse(proposal(northwind, ["duplicate-charge-refund"], ["naive", "fixed"]))], calls);
    const previousFiles = { "pack.yaml": "id: old-draft\n" };

    await generateWorldPack(INPUT, { client, formatDoc }, { note: "add a payments system", previousFiles });

    expect(calls).toHaveLength(1);
    expect(calls[0].messages[0].content).toContain("old-draft");
    expect(calls[0].messages[0].content).toContain("add a payments system");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// The route's guards — the two paths that must never reach the model.
// ══════════════════════════════════════════════════════════════════════════

describe("POST /api/worlds/generate", () => {
  const post = (body: unknown) =>
    new Request("http://localhost/api/worlds/generate", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

  /** Runs `fn` with ANTHROPIC_API_KEY forced to `key` (or unset), restoring it afterwards. */
  async function withKey(key: string | undefined, fn: () => Promise<void>): Promise<void> {
    const saved = process.env.ANTHROPIC_API_KEY;
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = key;
    try {
      await fn();
    } finally {
      if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = saved;
    }
  }

  it("says so plainly when there is no API key, instead of failing mid-call", async () => {
    await withKey(undefined, async () => {
      const res = await generateRoute(post(INPUT));
      expect(res.status).toBe(503);
      expect(((await res.json()) as { error: string }).error).toMatch(/ANTHROPIC_API_KEY/);
    });
  });

  it("rejects an incomplete body before it can spend anything", async () => {
    await withKey("sk-ant-not-a-real-key", async () => {
      const res = await generateRoute(post({ name: "X" }));
      expect(res.status).toBe(400);
    });
  });
});
