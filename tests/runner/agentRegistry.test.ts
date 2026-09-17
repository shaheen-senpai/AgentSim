import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAgent, getAgent, listAgents, saveAgent, type Agent, type AgentInput } from "@/runner/agentRegistry";
import { dataDir } from "@/runner/store";

function agent(over: Partial<Agent> = {}): AgentInput {
  return { name: "Codex", version: "1.0", shape: "forwarder", toolAliases: { fetch_ticket: "get_ticket" }, notes: "", ...over };
}

beforeAll(() => {
  process.env.AGENTSIM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "agentsim-agents-"));
});
beforeEach(() => {
  writeFileSync(path.join(dataDir(), "agents.json"), "[]");
});

describe("agentRegistry", () => {
  it("round-trips create, read, update and delete", () => {
    expect(listAgents()).toEqual([]);

    const saved = saveAgent(agent());
    expect(saved.id).toMatch(/^agt_[a-z0-9]+$/);
    expect(saved.createdAt).toMatch(/^\d{4}-/);
    expect(saved).toMatchObject({ name: "Codex", version: "1.0", shape: "forwarder", toolAliases: { fetch_ticket: "get_ticket" }, notes: "" });

    expect(listAgents()).toEqual([saved]);
    expect(getAgent(saved.id)).toEqual(saved);
    expect(getAgent("agt_nope")).toBeNull();

    const updated = saveAgent({ ...saved, name: "Codex CLI", toolAliases: {} });
    expect(updated.id).toBe(saved.id);
    expect(updated.createdAt).toBe(saved.createdAt); // replace by id, keep the original creation time
    expect(listAgents()).toHaveLength(1);
    expect(getAgent(saved.id)?.name).toBe("Codex CLI");

    const second = saveAgent(agent({ name: "Claude Code", shape: "mcp" }));
    expect(listAgents().map((a) => a.name)).toEqual(["Codex CLI", "Claude Code"]);

    expect(deleteAgent(saved.id)).toBe(true);
    expect(deleteAgent(saved.id)).toBe(false);
    expect(listAgents().map((a) => a.id)).toEqual([second.id]);
  });

  it("honours an explicit well-formed id and rejects a malformed one", () => {
    const saved = saveAgent(agent({ id: "agt_fixed1" }));
    expect(saved.id).toBe("agt_fixed1");
    expect(() => saveAgent(agent({ id: "../escape" }))).toThrow(/Invalid agent id/);
    expect(() => saveAgent(agent({ id: "AGT_UPPER" }))).toThrow(/Invalid agent id/);
    expect(getAgent("../../etc/passwd")).toBeNull();
    expect(deleteAgent("nope")).toBe(false);
  });

  it("reads a missing or corrupt agents.json as an empty registry", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.AGENTSIM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "agentsim-agents-empty-"));
    expect(listAgents()).toEqual([]); // no file at all
    expect(warn).not.toHaveBeenCalled();

    writeFileSync(path.join(dataDir(), "agents.json"), "{ not json");
    expect(listAgents()).toEqual([]);
    expect(warn).toHaveBeenCalled();

    writeFileSync(path.join(dataDir(), "agents.json"), '{"nope":1}'); // valid JSON, wrong shape
    expect(listAgents()).toEqual([]);

    // a corrupt file must not stop the next save from succeeding
    const saved = saveAgent(agent());
    expect(listAgents()).toEqual([saved]);
    warn.mockRestore();
  });

  it("writes atomically, leaving no .tmp behind", () => {
    saveAgent(agent());
    expect(readdirSync(dataDir()).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    expect(readdirSync(dataDir())).toContain("agents.json");
  });
});
