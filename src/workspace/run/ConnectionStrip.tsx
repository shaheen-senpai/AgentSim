"use client";
// Shown above a BYO Run's flow while it is running: the URLs its agent should point at (one MCP
// endpoint per System, or the forwarder endpoint), the Task Brief, the idle countdown and the
// Finish button. Every URL is derived from this page's own origin, so a tunnel, a LAN address and
// localhost each hand out a link that resolves for whoever is reading.
import { useEffect, useState } from "react";
import { Button } from "@/marketing/Button";
import { connectorBlock, curlTools, forwarderPy, forwarderTs, mcpAddCommand, serverName, toolsUrl } from "@/ui/connect/snippets";
import { idleLabel } from "@/ui/idle";
import type { RunRecord } from "@/ui/types";
import { useOrigin } from "@/ui/useOrigin";
import { card, eyebrow } from "../ui";
import { CopyButton } from "./bits";

const pre = "m-0 overflow-x-auto whitespace-pre rounded-control border border-border bg-background p-3 font-label text-[11.5px] leading-[1.6] text-foreground";
const note = "text-caption text-muted-foreground";

function CopyField({ text, what, wrap = false }: { text: string; what: string; wrap?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <code className={`min-w-0 flex-1 rounded-control border border-border bg-background px-3 py-2 font-label text-[11.5px] leading-[1.6] text-foreground ${wrap ? "whitespace-pre-wrap" : "overflow-x-auto whitespace-pre"}`}>{text}</code>
      <CopyButton text={text} what={what} />
    </div>
  );
}

export function ConnectionStrip({ run, systems, onFinished }: { run: RunRecord; systems: string[]; onFinished: (finished: RunRecord) => void }) {
  const origin = useOrigin();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const [lang, setLang] = useState<"ts" | "py">("ts");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shape = run.agent.kind === "byo" ? run.agent.shape : "mcp";
  const name = run.agent.kind === "byo" ? run.agent.name : "agentsim";
  const idle = idleLabel(run, now);
  const mcpUrls = origin ? systems.map((system) => ({ system, url: `${origin}/mcp/runs/${run.id}/${system}` })) : [];
  const callUrl = origin ? `${origin}/api/runs/${run.id}/call` : "";
  const mcpJson = JSON.stringify({ mcpServers: Object.fromEntries(mcpUrls.map(({ system, url }) => [`${serverName(name)}-${system}`, { type: "http", url }])) }, null, 2);

  async function finish() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${run.id}/finish`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as RunRecord & { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Finish failed (HTTP ${res.status}).`);
        return;
      }
      onFinished(data);
    } catch {
      setError("Network error — the Run was not finished.");
    } finally {
      setPending(false);
    }
  }

  const seg = (active: boolean) =>
    `cursor-pointer rounded-control px-3 py-1.5 font-label text-[11px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ring ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <section className={`${card} animate-reveal mt-6 p-5 sm:p-6`} aria-labelledby="connect-title">
      <div className="flex flex-wrap items-center gap-3">
        <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
        <h2 id="connect-title" className="font-heading text-h3 font-semibold">
          Waiting for your agent · {run.events.length} event{run.events.length === 1 ? "" : "s"}
          {idle ? ` · idle ${idle}` : ""}
        </h2>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {!origin ? null : shape === "mcp" ? (
          <>
            <div>
              <p className={eyebrow}>Claude Code — one server per source</p>
              <div className="mt-2 flex flex-col gap-2">
                {mcpUrls.map(({ system, url }) => <CopyField key={system} text={mcpAddCommand(`${name} ${system}`, url)} what="Command" />)}
              </div>
            </div>
            <div>
              <p className={eyebrow}>Or, any MCP client</p>
              <pre className={`${pre} mt-2`}>{mcpJson}</pre>
              <p className={`${note} mt-2`}>The Task Brief also arrives as each server&rsquo;s <span className="font-label">instructions</span>, so an MCP agent needs nothing else pasted.</p>
            </div>
          </>
        ) : shape === "forwarder" ? (
          <>
            <div>
              <p className={eyebrow}>Language</p>
              <div className="mt-2 inline-flex gap-1 rounded-control border border-border p-0.5" role="group" aria-label="Language">
                <button type="button" onClick={() => setLang("ts")} aria-pressed={lang === "ts"} className={seg(lang === "ts")}>TypeScript</button>
                <button type="button" onClick={() => setLang("py")} aria-pressed={lang === "py"} className={seg(lang === "py")}>Python</button>
              </div>
              <pre className={`${pre} mt-3`}>{lang === "py" ? forwarderPy(callUrl) : forwarderTs(callUrl)}</pre>
            </div>
            <div>
              <p className={eyebrow}>What this Run publishes</p>
              <div className="mt-2"><CopyField text={curlTools(toolsUrl(callUrl))} what="Command" /></div>
            </div>
          </>
        ) : shape === "driven" ? (
          <p className={note}>
            Nothing to paste: AgentSim calls this agent itself, at the endpoint registered for it, and sends it this
            Run&rsquo;s id. Its tool calls become Events here as it makes them against{" "}
            <span className="font-label">POST /api/runs/:id/call</span>; a Run that ends with none means the agent executed
            against its own world instead.
          </p>
        ) : (
          <div>
            <p className={eyebrow}>Messages API request</p>
            <pre className={`${pre} mt-2`}>{connectorBlock(mcpUrls[0]?.url ?? "")}</pre>
            <p className={`${note} mt-2`}>Needs a publicly reachable URL — a tunnel in front of this machine, not localhost — and <span className="font-label">AGENTSIM_ALLOWED_HOSTS</span> naming that host.</p>
          </div>
        )}

        <div>
          <p className={eyebrow}>Task Brief</p>
          <div className="mt-2"><CopyField text={run.taskBrief} what="Task Brief" wrap /></div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
          <Button onClick={finish} disabled={pending}>{pending ? "Finishing…" : "Finish & evaluate"}</Button>
          <span className={note}>Ends the Run now and scores what the agent did. It also finishes itself when the idle timer runs out.</span>
        </div>
        {error && <p role="alert" className="rounded-control border border-danger/50 border-l-2 border-l-danger bg-danger/5 px-3 py-2 text-caption text-danger">{error}</p>}
      </div>
    </section>
  );
}
