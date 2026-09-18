"use client";
// The "Generate" step of the World wizard: run the worldbuilder plugin from the agent's own repo.
// Same contract as the console's New world page — install, point it at this AgentSim, take a build
// token, ask the plugin. Nothing comes back through this screen: the plugin's own session writes
// the pack files and `create_world` creates the World here as a draft.
import { useEffect, useState } from "react";
import { Button } from "@/marketing/Button";
import { Icon } from "@/marketing/icons";
import { useOrigin } from "@/ui/useOrigin";
import { eyebrow, tag } from "../ui";

const WB_TOOLS = ["get_world_format", "validate_world_files", "create_world"];

async function issueToken(): Promise<{ token: string } | { error: string }> {
  try {
    const res = await fetch("/api/worlds/build-tokens", { method: "POST" });
    if (res.ok) return { token: ((await res.json()) as { token: string }).token };
    return { error: `Could not issue a build token (HTTP ${res.status}).` };
  } catch {
    return { error: "Network error — no build token issued." };
  }
}

const INSTALL = ["claude plugin marketplace add ./claude-plugin", "claude plugin install agentsim-worldbuilder"];

function CopyField({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the text is still selectable */
    }
  };
  return (
    <div className="flex items-stretch gap-2">
      <pre className="min-w-0 flex-1 overflow-x-auto rounded-control border border-border bg-background px-4 py-3 font-label text-caption text-foreground"><code>{text || "…"}</code></pre>
      <button type="button" onClick={copy} disabled={!text} aria-label={`Copy ${label}`} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border border-border px-3 font-label text-[11px] uppercase text-muted-foreground transition-colors duration-200 hover:border-primary/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50">
        <Icon name="copy" className="size-3.5" /> {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function PluginGenerate({ agentName }: { agentName: string }) {
  const origin = useOrigin();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** One token per plugin run: `create_world` refuses without a live one. */
  const newToken = () =>
    issueToken().then((r) => {
      if ("token" in r) setToken(r.token);
      else setError(r.error);
    });

  // Issued on the way in, so the step never shows an empty token field.
  useEffect(() => {
    let cancelled = false;
    void issueToken().then((r) => {
      if (cancelled) return;
      if ("token" in r) setToken(r.token);
      else setError(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const prompt = `Use agentsim-worldbuilder to build a test world for ${agentName}. Build token: ${token ?? "…"}`;
  const mcpUrl = origin ? `${origin}/mcp/worlds` : "";

  return (
    <div>
      <h2 className="font-heading text-h3 font-semibold">Run the worldbuilder plugin</h2>
      <p className="mt-2 max-w-3xl text-body text-muted-foreground">
        Install the plugin once, point it at this AgentSim, then ask it from your agent&apos;s own repo. It reads your tools, your schema, the third-party MCP servers you integrate and the Mandates your policy docs state, writes the World&apos;s structure and creates it here as a draft. It writes no Scenario and no seed row — those are generated on the World afterwards, once you have reviewed what it built.
      </p>

      <div className="mt-6 flex flex-col gap-6">
        <section>
          <p className={eyebrow}>1 · Install</p>
          <div className="mt-2 flex flex-col gap-2">{INSTALL.map((c) => <CopyField key={c} text={c} label="command" />)}</div>
        </section>
        <section>
          <p className={eyebrow}>2 · Point it here</p>
          <div className="mt-2"><CopyField text={mcpUrl} label="URL" /></div>
          <p className="mt-2 text-caption text-muted-foreground">
            The plugin&apos;s <span className="font-label">.mcp.json</span> points at <span className="font-label">http://localhost:3000/mcp/worlds</span>; edit it if this AgentSim is elsewhere. Off localhost, the server also needs <span className="font-label">AGENTSIM_ALLOWED_HOSTS</span> naming the host it is reached on.
          </p>
        </section>
        <section>
          <p className={eyebrow}>3 · Your build token</p>
          <div className="mt-2 flex flex-wrap items-stretch gap-2">
            <div className="min-w-[240px] flex-1"><CopyField text={token ?? ""} label="token" /></div>
            <Button variant="outline" onClick={() => void newToken()}>New token</Button>
          </div>
          <p className="mt-2 text-caption text-muted-foreground">Single use, expires in an hour. It is what lets the plugin write a World here, so building one needs this workspace rather than just the URL.</p>
        </section>
        <section>
          <p className={eyebrow}>4 · In your agent&apos;s repo, in a Claude Code session</p>
          <div className="mt-2"><CopyField text={token ? prompt : ""} label="prompt" /></div>
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Plugin tools">
            {WB_TOOLS.map((t) => <li key={t} className={tag}>{t}</li>)}
          </ul>
        </section>
      </div>

      <section className="mt-8 border-t border-border pt-6" aria-live="polite">
        <p className={eyebrow}>What happens next</p>
        <p className="mt-3 text-body text-muted-foreground">
          The plugin writes the pack files in its own session, validates them against this AgentSim and creates the World as a draft. It appears in
          this agent&apos;s Worlds when it does — review it there, generate its Scenarios and seed data, then publish it.
        </p>
        {error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-control border border-danger/50 bg-danger/10 px-3 py-2 text-caption text-danger"><Icon name="alert" className="mt-0.5 size-4 shrink-0" /> {error}</p>}
      </section>
    </div>
  );
}
