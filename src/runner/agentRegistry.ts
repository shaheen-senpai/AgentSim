// The registry of external agents people have connected: `<dataDir>/agents.json`, a JSON array.
//
// An `Agent` is a saved *description* of someone's agent — its shape (how it will talk to us) and
// its tool aliases (what it calls our tools). A Run copies `name`, `shape` and `toolAliases` onto
// its `RunAgentRef` at creation, so editing an Agent here never rewrites history.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AgentShape } from "./agentRef";
import { dataDir } from "./store";

/** How an Agent entered the workspace: through the AgentSim MCP plugin, or typed in by hand. */
export type AgentSource = "mcp" | "manual";

export type Agent = {
  id: string;
  name: string;
  version: string;
  shape: AgentShape;
  toolAliases: Record<string, string>;
  notes: string;
  createdAt: string;
  // Workspace fields (the `/agents` pages). All default, so records written before they existed
  // still read back — see `normalize`.
  source: AgentSource;
  description: string;
  mandate: string;
  /** The agent's own tool names, as its MCP manifest (or its owner) lists them. */
  tools: string[];
  /** The business entities the agent touches. */
  entities: string[];
  /** World packs attached to this agent — the controlled companies it is examined in. */
  worldIds: string[];
};

type WorkspaceField = "source" | "description" | "mandate" | "tools" | "entities" | "worldIds";

/** What `saveAgent` accepts: a new agent (no id, no createdAt) or an existing one being replaced. */
export type AgentInput = Omit<Agent, "id" | "createdAt" | WorkspaceField> & Partial<Pick<Agent, "id" | "createdAt" | WorkspaceField>>;

const AGENT_ID_RE = /^agt_[a-z0-9]+$/;

/**
 * What an API caller may send for an Agent. The registry owns this so both `/api/agents` routes
 * validate against one definition; `toolAliases` and `notes` default rather than being required.
 */
export const AgentInputSchema = z.object({
  id: z.string().regex(AGENT_ID_RE).optional(),
  name: z.string().min(1),
  version: z.string().min(1),
  shape: z.enum(["mcp", "forwarder", "connector"]),
  toolAliases: z.record(z.string().min(1), z.string().min(1)).default({}),
  notes: z.string().default(""),
  source: z.enum(["mcp", "manual"]).default("manual"),
  description: z.string().max(4000).default(""),
  mandate: z.string().max(4000).default(""),
  tools: z.array(z.string().min(1).max(200)).max(200).default([]),
  entities: z.array(z.string().min(1).max(200)).max(200).default([]),
  worldIds: z.array(z.string().min(1).max(200)).max(50).default([]),
});

/** A record as written before the workspace fields existed, brought up to the current shape. */
function normalize(a: Partial<Agent> & Pick<Agent, "id" | "name" | "version" | "shape" | "createdAt">): Agent {
  return {
    ...a,
    toolAliases: a.toolAliases ?? {},
    notes: a.notes ?? "",
    source: a.source ?? "manual",
    description: a.description ?? "",
    mandate: a.mandate ?? "",
    tools: a.tools ?? [],
    entities: a.entities ?? [],
    worldIds: a.worldIds ?? [],
  };
}

const agentsFile = () => path.join(dataDir(), "agents.json");

function newAgentId(): string {
  return `agt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Tolerant read: a missing file is an empty registry, a corrupt one is warned about and ignored. */
function readAll(): Agent[] {
  const file = agentsFile();
  if (!existsSync(file)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    console.warn(`[agentRegistry] skipping unreadable ${file}`);
    return [];
  }
  return Array.isArray(parsed) ? (parsed as Agent[]).map(normalize) : [];
}

function writeAll(agents: Agent[]): void {
  mkdirSync(dataDir(), { recursive: true });
  const file = agentsFile();
  // Unique per write: a fixed `agents.json.tmp` lets two concurrent saves write the same scratch
  // file and rename each other's half-written bytes into place.
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  writeFileSync(tmp, JSON.stringify(agents), "utf8");
  renameSync(tmp, file);
}

export function listAgents(): Agent[] {
  return readAll();
}

export function getAgent(id: string): Agent | null {
  if (!AGENT_ID_RE.test(id)) return null;
  return readAll().find((a) => a.id === id) ?? null;
}

/** Inserts a new Agent or replaces the one with the same id (keeping its original `createdAt`). */
export function saveAgent(input: AgentInput): Agent {
  if (input.id !== undefined && !AGENT_ID_RE.test(input.id)) throw new Error(`Invalid agent id '${input.id}'`);
  const agents = readAll();
  const id = input.id ?? newAgentId();
  const existing = agents.find((a) => a.id === id);
  const agent: Agent = {
    id,
    name: input.name,
    version: input.version,
    shape: input.shape,
    toolAliases: input.toolAliases,
    notes: input.notes,
    createdAt: existing?.createdAt ?? input.createdAt ?? new Date().toISOString(),
    source: input.source ?? "manual",
    description: input.description ?? "",
    mandate: input.mandate ?? "",
    tools: input.tools ?? [],
    entities: input.entities ?? [],
    worldIds: input.worldIds ?? [],
  };
  const next = existing ? agents.map((a) => (a.id === id ? agent : a)) : [...agents, agent];
  writeAll(next);
  return agent;
}

/** Returns false when no such Agent was registered. */
export function deleteAgent(id: string): boolean {
  if (!AGENT_ID_RE.test(id)) return false;
  const agents = readAll();
  const next = agents.filter((a) => a.id !== id);
  if (next.length === agents.length) return false;
  writeAll(next);
  return true;
}
