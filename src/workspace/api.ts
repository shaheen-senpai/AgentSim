// The workspace's three calls to the agents API. Errors come back as messages, never thrown.
import type { AgentInput } from "@/runner/agentRegistry";
import type { Agent } from "@/ui/types";

const json = { "content-type": "application/json" };

async function failure(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `${fallback} (HTTP ${res.status}).`;
}

export type ApiResult = { agent: Agent; error: null } | { agent: null; error: string };

export async function createAgent(input: AgentInput): Promise<ApiResult> {
  try {
    const res = await fetch("/api/agents", { method: "POST", headers: json, body: JSON.stringify(input) });
    if (!res.ok) return { agent: null, error: await failure(res, "The agent was not saved") };
    return { agent: (await res.json()) as Agent, error: null };
  } catch {
    return { agent: null, error: "Network error — nothing was saved." };
  }
}

export async function updateAgent(agent: Agent): Promise<ApiResult> {
  const { id, createdAt: _createdAt, ...body } = agent;
  void _createdAt;
  try {
    const res = await fetch(`/api/agents/${id}`, { method: "PUT", headers: json, body: JSON.stringify(body) });
    if (!res.ok) return { agent: null, error: await failure(res, "The agent was not updated") };
    return { agent: (await res.json()) as Agent, error: null };
  } catch {
    return { agent: null, error: "Network error — nothing was saved." };
  }
}

/** Splits a "one per line" textarea into trimmed, de-duplicated entries. */
export function lines(text: string): string[] {
  return [...new Set(text.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean))];
}
