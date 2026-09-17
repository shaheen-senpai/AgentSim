"use client";
// Start a shift: pick what the agent will be put through, say how it gets in, press go.
//
// The whole page is two decisions. Everything else — the Task Brief, the tool catalogue, the URLs —
// is derived, and shown on the Run page where it is actually needed. The endpoint field writes back
// to the agent registry on start, so "where do I reach your agent" is asked once and then remembered.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/marketing/Button";
import { Icon } from "@/marketing/icons";
import type { Agent } from "@/ui/types";
import { updateAgent } from "../api";
import { card, container, eyebrow, fieldLabel, input, tag } from "../ui";
import { BridgeStatus } from "./BridgePanel";
import { connectionOf } from "./bridge";
import { useBridge } from "./useBridge";

export type LaunchScenario = { id: string; title: string; taskBrief: string; attacks: { id: string; title: string }[] };

type Props = {
  agent: Agent;
  world: { id: string; name: string };
  scenarios: LaunchScenario[];
  /** False for a World still in review: `POST /api/runs` refuses it, so the page says so first. */
  runnable: boolean;
  initialScenarioId: string | null;
};

const optionCard = (selected: boolean) =>
  `w-full cursor-pointer rounded-panel border p-4 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
    selected ? "border-primary/70 bg-primary/5" : "border-border bg-background hover:border-primary/40"
  }`;

export function RunLauncher({ agent: initialAgent, world, scenarios, runnable, initialScenarioId }: Props) {
  const router = useRouter();
  const [agent, setAgent] = useState(initialAgent);
  const [mode, setMode] = useState<"bridge" | "mcp">(connectionOf(initialAgent).kind);
  const [url, setUrl] = useState(initialAgent.url);
  const [scenarioId, setScenarioId] = useState(initialScenarioId ?? scenarios[0]?.id ?? "");
  const [attackId, setAttackId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The probe reads the *saved* agent, so an edited-but-unsaved URL is not something it can check yet.
  const saved = connectionOf(agent);
  const { probe, checking, check } = useBridge(agent.id, mode === "bridge" && saved.kind === "bridge" && saved.url === url.trim());
  const scenario = scenarios.find((s) => s.id === scenarioId) ?? null;

  async function start() {
    if (!scenario) return;
    setStarting(true);
    setError(null);
    try {
      // One place the endpoint is set. A plugin-imported agent arrives with no URL and no way in;
      // typing one here is what turns it into an agent AgentSim can actually drive.
      if (mode === "bridge" && (agent.shape !== "driven" || agent.url !== url.trim())) {
        if (url.trim() === "") {
          setError("A bridge needs the URL AgentSim should call.");
          return;
        }
        const next = { ...agent, shape: "driven" as const, url: url.trim() };
        const result = await updateAgent(next);
        if (result.agent === null) {
          setError(result.error);
          return;
        }
        setAgent(result.agent);
      } else if (mode === "mcp" && agent.shape === "driven") {
        const result = await updateAgent({ ...agent, shape: "mcp", url: "" });
        if (result.agent === null) {
          setError(result.error);
          return;
        }
        setAgent(result.agent);
      }

      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packId: world.id, scenarioId: scenario.id, attackId, agent: { kind: "byo", agentId: agent.id } }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? `The Run did not start (HTTP ${res.status}).`);
        return;
      }
      router.push(`/agents/${agent.id}/worlds/${world.id}/runs/${data.id}`);
    } catch {
      setError("Network error — no Run was started.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <main id="main" className={`${container} pb-20 pt-8`}>
      <a href={`/agents/${agent.id}/worlds/${world.id}`} className={`${eyebrow} inline-flex items-center gap-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring`}>
        <Icon name="arrow-left" className="size-3.5" /> {world.name}
      </a>
      <h1 className="mt-4 font-heading text-display font-semibold">Run a shift</h1>
      <p className="mt-3 max-w-3xl text-lead text-muted-foreground">
        One shift puts <b className="text-foreground">{agent.name}</b> through one scenario in {world.name} and grades every tool call it makes against the Mandate.
      </p>

      {!runnable && (
        <p className="mt-6 rounded-panel border border-warning/50 bg-warning/10 px-4 py-3 text-body text-warning">
          This World is still in review. Publish it from its Overview before running a shift against it.
        </p>
      )}

      <section className={`${card} mt-7 p-6`} aria-labelledby="how-title">
        <p className={eyebrow}>Step 1</p>
        <h2 id="how-title" className="mt-1 font-heading text-h3 font-semibold">How the agent gets in</h2>
        <p className="mt-2 max-w-3xl text-body text-muted-foreground">
          Either way, the agent&rsquo;s tool calls have to land on this Run&rsquo;s Gateway — that is what makes them Events, and Events are the only thing that is graded.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <button type="button" className={optionCard(mode === "bridge")} aria-pressed={mode === "bridge"} onClick={() => setMode("bridge")}>
            <span className="flex items-center gap-2 font-heading text-body font-semibold"><Icon name="plug" className="size-4 text-primary" /> Bridge · AgentSim calls your agent</span>
            <span className="mt-2 block text-caption text-muted-foreground">
              We POST the Task Brief and a runId to an endpoint you already run. Your agent executes its tools against this Run instead of its own world. Nothing in its deployment is repointed.
            </span>
          </button>
          <button type="button" className={optionCard(mode === "mcp")} aria-pressed={mode === "mcp"} onClick={() => setMode("mcp")}>
            <span className="flex items-center gap-2 font-heading text-body font-semibold"><Icon name="terminal" className="size-4" /> MCP · your agent calls us</span>
            <span className="mt-2 block text-caption text-muted-foreground">
              AgentSim publishes one MCP server per source. You point your agent&rsquo;s MCP config at them and start it by hand; the commands appear once the Run exists.
            </span>
          </button>
        </div>

        {mode === "bridge" ? (
          <div className="mt-5">
            <label htmlFor="bridge-url" className={fieldLabel}>Endpoint URL</label>
            <input
              id="bridge-url"
              className={`${input} mt-1.5 font-mono`}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:4100/"
              spellCheck={false}
              aria-describedby="bridge-url-hint"
            />
            <p id="bridge-url-hint" className="mt-1.5 text-caption text-muted-foreground">
              It receives <code className="font-mono">{"{ runId, taskBrief, messages }"}</code> and answers <code className="font-mono">{"{ reply }"}</code>. Hosts other than this machine must be named in <code className="font-mono">AGENTSIM_ALLOWED_AGENT_HOSTS</code>.
            </p>
            <div className="mt-4">
              {saved.kind === "bridge" && saved.url === url.trim() ? (
                <BridgeStatus probe={probe} checking={checking} onCheck={check} />
              ) : (
                <p className="text-caption text-muted-foreground">Saved when the Run starts, and checked from the Run page.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-5 text-caption text-muted-foreground">
            The Run will wait for your agent to connect and finish itself if nothing does. The per-source commands are on the Run page.
          </p>
        )}
      </section>

      <section className={`${card} mt-5 p-6`} aria-labelledby="scenario-title">
        <p className={eyebrow}>Step 2</p>
        <h2 id="scenario-title" className="mt-1 font-heading text-h3 font-semibold">The scenario</h2>
        {scenarios.length === 0 ? (
          <p className="mt-3 text-body text-muted-foreground">This World has no scenarios yet. Generate some on its Scenarios tab first.</p>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {scenarios.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={optionCard(s.id === scenarioId)}
                  aria-pressed={s.id === scenarioId}
                  onClick={() => { setScenarioId(s.id); setAttackId(null); }}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-heading text-body font-semibold">{s.title}</span>
                    <span className={tag}>{s.attacks.length} attack{s.attacks.length === 1 ? "" : "s"}</span>
                  </span>
                  <span className="mt-2 line-clamp-2 block text-caption text-muted-foreground">{s.taskBrief}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {scenario && scenario.attacks.length > 0 && (
          <div className="mt-5">
            <p className={eyebrow}>Poison</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAttackId(null)}
                aria-pressed={attackId === null}
                className={`cursor-pointer rounded-control border px-3 py-2 text-caption transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ring ${attackId === null ? "border-primary/70 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                Clean shift
              </button>
              {scenario.attacks.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAttackId(a.id)}
                  aria-pressed={attackId === a.id}
                  title={a.title}
                  className={`max-w-md cursor-pointer truncate rounded-control border px-3 py-2 text-caption transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ring ${attackId === a.id ? "border-danger/70 bg-danger/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {a.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button onClick={start} disabled={starting || !scenario || !runnable}>
          {starting ? "Starting…" : "Start the shift"} <Icon name="play" className="size-4" />
        </Button>
        <span className="text-caption text-muted-foreground">
          {mode === "bridge" ? "AgentSim calls your agent as soon as the Run exists." : "The Run opens and waits for your agent to connect."}
        </span>
      </div>
      <div role="status" aria-live="polite">
        {error && <p className="mt-4 rounded-panel border border-danger/50 bg-danger/10 px-4 py-3 text-body text-danger">{error}</p>}
      </div>
    </main>
  );
}
