// Stage one — the World's structure — without the network. Every model call here comes from a fake
// client: the tests prove what `buildPrompt` puts in front of the model and that the
// validate-and-retry loop really re-prompts with the errors — never that the API works.
import { beforeAll, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { POST as generateRoute } from "@/app/api/worlds/generate/route";
import { loadPack, parsePackFiles, type PackFiles, type ValidationError } from "@/engine/pack";
import { MAX_ATTEMPTS } from "@/generate/call";
import { examplePackFiles, loadFormatDoc } from "@/generate/formatDoc";
import { buildPrompt, generateStructure, mandateSection, matchProvider, mcpServerSection, PROPOSE_TOOL, TOOL_NAME, toolsToText, type StructureInput } from "@/generate/structure";
import { withPackStatus } from "@/ui/worlds/packEdits";
import { usePacksDir } from "../helpers/packs";

// ───────────────────────────── the fake client ─────────────────────────────

type StreamParams = {
  system: string;
  messages: { role: string; content: string }[];
  tools: { name: string }[];
  tool_choice: { type: string; name?: string };
};

type FakeMessage = { stop_reason: string; content: { type: string; name?: string; input?: unknown }[] };

const proposal = (files: PackFiles) => ({ pack_yaml: files["pack.yaml"], seed_yaml: files["seed.yaml"], tools_yaml: files["tools.yaml"] });

const PROVIDERS = ["google-workspace", "okta", "slack", "stripe", "zendesk"];

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

const INPUT: StructureInput = {
  name: "Halvard Helpdesk",
  domain: "it-helpdesk",
  description: "An internal IT helpdesk: employees raise tickets, agents grant access and reset devices.",
  schema: "CREATE TABLE tickets (id text primary key, employee_id text references employees(id));",
  tools: "get_ticket, grant_access, reset_device",
  openapi: "openapi: 3.1.0",
};

/**
 * What stage one really returns: the three structural files, and nothing else — with `status: draft`
 * stamped on, because a World with no Scenarios is only valid as a draft.
 */
function structureOf(files: PackFiles): PackFiles {
  return { "pack.yaml": withPackStatus(files["pack.yaml"], "draft"), "seed.yaml": files["seed.yaml"], "tools.yaml": files["tools.yaml"] };
}

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
    // And that the Mandate citation the doc recommends is the one it demonstrates.
    const cited = pack!.scenarios[0].policy.mandate!;
    expect(pack!.meta.mandates[cited].text).toBe(pack!.scenarios[0].policy.text);
  });
});

describe("buildPrompt", () => {
  it("puts the whole format doc and every input in front of the model", () => {
    const { system, user } = buildPrompt(INPUT, formatDoc, PROVIDERS);

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
    const { user } = buildPrompt({ name: "A", domain: "b", description: "c" }, formatDoc, PROVIDERS);
    expect(user).not.toContain("## Database schema");
    expect(user).not.toContain("## Tool list");
    expect(user).not.toContain("## OpenAPI specification");
  });

  it("lists the previous draft's validation errors when there are some", () => {
    const previous: ValidationError[] = [
      { file: "tools.yaml", path: "tools.grant_access.system", message: "system 'access' is not declared in pack.yaml systems" },
      { file: "seed.yaml", path: "rows.tickets[0].id", message: "row t1 in tickets must start with tkt_" },
    ];
    const { user } = buildPrompt(INPUT, formatDoc, PROVIDERS, previous);

    expect(user).toContain("did not validate");
    for (const e of previous) {
      expect(user).toContain(e.file);
      expect(user).toContain(e.path);
      expect(user).toContain(e.message);
    }
  });

  it("shows the current draft and the requested change when refining", () => {
    const previousFiles = { "pack.yaml": "id: acme\nname: Acme\n", "tools.yaml": "get_ticket:\n  system: support\n" };
    const { user } = buildPrompt(INPUT, formatDoc, PROVIDERS, undefined, { note: "Add a Stripe-like payments system.", previousFiles });

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
    const { user } = buildPrompt(INPUT, formatDoc, PROVIDERS, errors, { note: "add refunds", previousFiles });

    expect(user).toContain("## Current draft");
    expect(user).toContain("## Requested change");
    expect(user).toContain("did not validate");
    expect(user).toContain("system 'nope' is not declared");
  });

  it("omits the current-draft section when there is no refinement", () => {
    const { user } = buildPrompt(INPUT, formatDoc, PROVIDERS);
    expect(user).not.toContain("## Current draft");
    expect(user).not.toContain("## Requested change");
  });

  it("tells the model this stage writes no rows, Scenarios or prompts", () => {
    const { system } = buildPrompt(INPUT, formatDoc, PROVIDERS);
    expect(system).toContain("empty array for every declared entity");
    expect(system).toContain("Write no Scenarios, no Attacks and no agent prompts");
    expect(system).not.toContain("Seed at least three principals"); // that rule belongs to stage two
  });

  it("carries the captured MCP servers, shadowing the ones our catalog covers", () => {
    const { user } = buildPrompt(
      { ...INPUT, mcpServers: [{ name: "stripe-mcp" }, { name: "acme-billing", tools: [{ name: "charge_card", description: "Take a payment." }] }] },
      formatDoc,
      PROVIDERS,
    );
    expect(user).toContain("Third-party MCP servers this agent integrates");
    expect(user).toContain("mode: shadowed, provider: stripe");
    expect(user).toContain("acme-billing → no catalog for it");
    expect(user).toContain("charge_card"); // an unknown server's tools have to come from the repo
  });

  it("carries the Mandates verbatim, with where they were read from", () => {
    const { user } = buildPrompt(
      { ...INPUT, mandates: [{ title: "Refunds", text: "Never refund more than was charged.", source: "POLICY.md" }] },
      formatDoc,
      PROVIDERS,
    );
    expect(user).toContain("Mandates read from the agent's own policy");
    expect(user).toContain("Refunds (from POLICY.md)");
    expect(user).toContain("Never refund more than was charged.");
  });
});

describe("matchProvider", () => {
  it("matches a catalog provider however the client config spells it", () => {
    expect(matchProvider({ name: "stripe" }, PROVIDERS)).toBe("stripe");
    expect(matchProvider({ name: "stripe-mcp" }, PROVIDERS)).toBe("stripe");
    expect(matchProvider({ name: "Stripe Payments" }, PROVIDERS)).toBe("stripe");
    expect(matchProvider({ name: "google_workspace" }, PROVIDERS)).toBe("google-workspace");
  });

  it("is null for a server we have no catalog for, which is what makes it a mocked system", () => {
    expect(matchProvider({ name: "acme-billing" }, PROVIDERS)).toBeNull();
    expect(matchProvider({ name: "" }, PROVIDERS)).toBeNull();
  });
});

describe("prompt sections that are empty when nothing was captured", () => {
  it("writes no MCP or Mandate section at all", () => {
    expect(mcpServerSection(undefined, PROVIDERS)).toBe("");
    expect(mcpServerSection([], PROVIDERS)).toBe("");
    expect(mandateSection(undefined)).toBe("");
    expect(mandateSection([])).toBe("");
    expect(toolsToText(undefined)).toBeUndefined();
    expect(toolsToText([])).toBeUndefined();
  });

  it("renders a tool list with its description and input schema", () => {
    expect(toolsToText([{ name: "get_ticket", description: "Fetch one.", inputSchema: { type: "object" } }])).toBe(
      '- get_ticket: Fetch one.\n  input: {"type":"object"}',
    );
  });
});

describe("generateStructure", () => {
  it("retries once with the validation errors, and returns the second, valid draft", async () => {
    const calls: StreamParams[] = [];
    const broken = { ...proposal(northwind), tools_yaml: "get_ticket:\n  system: nope\n" };
    const client = fakeClient([toolUse(broken), toolUse(proposal(northwind))], calls);

    const result = await generateStructure(INPUT, { client, formatDoc, providerIds: PROVIDERS });

    expect(result.attempts).toBe(2);
    expect(result.errors).toEqual([]);
    // Structure only: no scenario files, no agent prompts, whatever the model was shown.
    expect(result.files).toEqual(structureOf(northwind));

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
    const broken = { ...proposal(northwind), tools_yaml: "get_ticket:\n  system: nope\n" };
    const client = fakeClient([toolUse(broken), toolUse(broken)], calls);

    const result = await generateStructure(INPUT, { client, formatDoc, providerIds: PROVIDERS });

    expect(result.attempts).toBe(MAX_ATTEMPTS);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every((e) => e.file === "tools.yaml")).toBe(true);
    expect(result.files["tools.yaml"]).toBe(broken.tools_yaml); // the draft is still handed back for a human to fix
  });

  it("stops on the first call when the first draft validates", async () => {
    const calls: StreamParams[] = [];
    const client = fakeClient([toolUse(proposal(northwind))], calls);

    const result = await generateStructure(INPUT, { client, formatDoc, providerIds: PROVIDERS });

    expect(result).toEqual({ files: structureOf(northwind), errors: [], attempts: 1 });
    expect(calls).toHaveLength(1);
  });

  it("throws a clear error when the model refuses", async () => {
    const client = fakeClient([{ stop_reason: "refusal", content: [] }], []);
    await expect(generateStructure(INPUT, { client, formatDoc, providerIds: PROVIDERS })).rejects.toThrow(/refused/i);
  });

  it("throws when the model stops without calling the tool", async () => {
    const client = fakeClient([{ stop_reason: "end_turn", content: [{ type: "text" }] }], []);
    await expect(generateStructure(INPUT, { client, formatDoc, providerIds: PROVIDERS })).rejects.toThrow(/without calling propose_world_structure/);
  });
});

describe("generateStructure with a refinement", () => {
  it("passes the draft's current files and the note through to buildPrompt's user message", async () => {
    const calls: StreamParams[] = [];
    const client = fakeClient([toolUse(proposal(northwind))], calls);
    const previousFiles = { "pack.yaml": "id: old-draft\n" };

    await generateStructure(INPUT, { client, formatDoc, providerIds: PROVIDERS }, { note: "add a payments system", previousFiles });

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
