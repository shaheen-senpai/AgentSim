import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  briefUrl,
  connectorBlock,
  curlTools,
  forwarderPy,
  forwarderTs,
  mcpAddCommand,
  mcpJsonConfig,
  serverName,
  toolsUrl,
} from "@/ui/connect/snippets";

// Deliberately not localhost: every assertion below is about a snippet carrying back the origin it
// was handed, and a localhost fixture would pass even if a builder ignored its argument entirely.
const ORIGIN = "https://agentsim-demo.trycloudflare.com";
const RUN_ID = "run_mtzu1a2b3c";
const MCP_URL = `${ORIGIN}/mcp/runs/${RUN_ID}`;
const CALL_URL = `${ORIGIN}/api/runs/${RUN_ID}/call`;

describe("serverName", () => {
  it("slugifies an agent's display name into something safe in a shell and a JSON key", () => {
    expect(serverName("Acme Triage Bot")).toBe("acme-triage-bot");
    expect(serverName("  Support_Agent v2!  ")).toBe("support-agent-v2");
  });

  it("falls back to 'agentsim' when the name slugifies to nothing", () => {
    expect(serverName("!!!")).toBe("agentsim");
    expect(serverName("")).toBe("agentsim");
  });
});

describe("sibling URLs", () => {
  it("derives the tools and brief URLs from the Run's own call URL", () => {
    expect(toolsUrl(CALL_URL)).toBe(`${ORIGIN}/api/runs/${RUN_ID}/tools`);
    expect(briefUrl(CALL_URL)).toBe(`${ORIGIN}/api/runs/${RUN_ID}/brief`);
  });

  it("only rewrites the trailing segment, so an origin containing 'call' survives", () => {
    const odd = "https://call.example.test/api/runs/run_x/call";
    expect(toolsUrl(odd)).toBe("https://call.example.test/api/runs/run_x/tools");
  });
});

describe("every snippet carries the URL it was given", () => {
  it("shape A — the MCP add command and the generic JSON config", () => {
    expect(mcpAddCommand("Acme Triage Bot", MCP_URL)).toContain(MCP_URL);
    expect(mcpAddCommand("Acme Triage Bot", MCP_URL)).toBe(`claude mcp add --transport http acme-triage-bot ${MCP_URL}`);
    expect(mcpJsonConfig("Acme Triage Bot", MCP_URL)).toContain(MCP_URL);
  });

  it("shape B — both forwarders and the tools curl", () => {
    expect(forwarderTs(CALL_URL)).toContain(CALL_URL);
    expect(forwarderPy(CALL_URL)).toContain(CALL_URL);
    expect(curlTools(toolsUrl(CALL_URL))).toContain(`${ORIGIN}/api/runs/${RUN_ID}/tools`);
  });

  it("shape C — the Anthropic connector block", () => {
    expect(connectorBlock(MCP_URL)).toContain(MCP_URL);
  });
});

describe("mcpJsonConfig", () => {
  it("is valid JSON declaring the server under the agent's slug as Streamable HTTP", () => {
    const parsed = JSON.parse(mcpJsonConfig("Acme Triage Bot", MCP_URL));
    expect(parsed).toEqual({ mcpServers: { "acme-triage-bot": { type: "http", url: MCP_URL } } });
  });
});

describe("connectorBlock", () => {
  it("is valid JSON pairing mcp_servers with the matching mcp_toolset and the client beta", () => {
    const parsed = JSON.parse(connectorBlock(MCP_URL)) as {
      betas: string[];
      mcp_servers: { type: string; name: string; url: string }[];
      tools: { type: string; mcp_server_name: string }[];
    };
    // `mcp_servers` on its own is a validation error on the Messages API — the toolset entry and
    // the beta are not decoration, they are what makes the block work.
    expect(parsed.betas).toContain("mcp-client-2025-11-20");
    expect(parsed.mcp_servers).toEqual([{ type: "url", name: "agentsim", url: MCP_URL }]);
    expect(parsed.tools).toEqual([{ type: "mcp_toolset", mcp_server_name: "agentsim" }]);
    expect(parsed.mcp_servers[0].name).toBe(parsed.tools[0].mcp_server_name);
  });
});

describe("forwarderTs", () => {
  const snippet = forwarderTs(CALL_URL);

  it("is at most 40 lines — the pitch is that this is a small change", () => {
    expect(snippet.split("\n").length).toBeLessThanOrEqual(40);
  });

  it("POSTs { tool, input, callId } to the call URL", () => {
    expect(snippet).toContain("JSON.stringify({ tool, input, callId })");
    expect(snippet).toContain('method: "POST"');
    expect(snippet).toContain('headers: { "content-type": "application/json" }');
  });

  it("reads AGENTSIM_CALL_URL first, so the Run URL is the default and not a hardcoding", () => {
    expect(snippet).toContain("process.env.AGENTSIM_CALL_URL");
  });
});

describe("forwarderPy", () => {
  const snippet = forwarderPy(CALL_URL);

  it("posts the same three fields under the wire names the API expects", () => {
    expect(snippet).toContain('"tool": tool');
    expect(snippet).toContain('"input": tool_input or {}');
    expect(snippet).toContain('"callId": call_id');
  });

  it("reads AGENTSIM_CALL_URL first", () => {
    expect(snippet).toContain('os.environ.get("AGENTSIM_CALL_URL"');
  });
});

// ─────────────────────────── no hardcoded origin, ever ───────────────────────────

/**
 * The whole promise of the Connect page is "any agent, nothing to install, just a URL" — and the
 * URL has to be the one the Run handed back, derived from the request's own origin, so a tunnel or
 * a LAN address works as well as a laptop. A `localhost` that crept into a template would look
 * right in dev and be broken for every reader who is not on the machine that served the page.
 * This is a text check on the module itself, so it fails the moment one is typed.
 */
describe("snippets: no hardcoded origin", () => {
  it("never mentions localhost, 127.0.0.1 or a literal scheme in the module's code", () => {
    // Comments are stripped first: the prose above the builders talks *about* localhost, and the
    // point of the check is the code and the templates, not the explanation of why they look so.
    const source = readFileSync("src/ui/connect/snippets.ts", "utf8");
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|#|\*)/.test(line))
      .join("\n");
    expect(code).not.toMatch(/localhost/i);
    expect(code).not.toMatch(/127\.0\.0\.1/);
    expect(code).not.toMatch(/https?:\/\//);
  });

  it("produces output that mentions no origin other than the one passed in", () => {
    const outputs = [
      mcpAddCommand("Acme", MCP_URL),
      mcpJsonConfig("Acme", MCP_URL),
      forwarderTs(CALL_URL),
      forwarderPy(CALL_URL),
      connectorBlock(MCP_URL),
      curlTools(toolsUrl(CALL_URL)),
    ];
    for (const out of outputs) {
      expect(out, "a snippet mentioned localhost").not.toMatch(/localhost/i);
      for (const found of out.match(/https?:\/\/[^\s"'`|)]+/g) ?? []) {
        expect(found.startsWith(ORIGIN), `snippet leaked a foreign origin: ${found}`).toBe(true);
      }
    }
  });
});
