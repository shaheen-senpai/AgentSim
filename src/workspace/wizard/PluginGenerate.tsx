"use client";
// The "Generate" step of the World wizard: run the worldbuilder plugin from the agent's own repo.
// Same contract as the console's New world page — install, point it at this AgentSim, take a build
// token, ask the plugin — and the drafts it registers appear here, refreshed every five seconds.
import { useEffect, useState } from "react";
import type { ValidationError } from "@/engine/pack";
import type { DraftSummary } from "@/lib/draftSummary";
import { Button } from "@/marketing/Button";
import { Icon } from "@/marketing/icons";
import { relativeTime } from "@/ui/relativeTime";
import { useOrigin } from "@/ui/useOrigin";
import { eyebrow, tag } from "../ui";

export type PluginDraft = { id: string; files: Record<string, string>; errors: ValidationError[]; input: { name: string; domain: string; description: string }; token: string | null; client?: string; repo?: string };

const WB_TOOLS = ["register_agent", "get_world_draft", "refine_world", "create_world"];

async function issueToken(): Promise<{ token: string } | { error: string }> {
  try {
    const res = await fetch("/api/worlds/build-tokens", { method: "POST" });
    if (res.ok) return { token: ((await res.json()) as { token: string }).token };
    return { error: `Could not issue a build token (HTTP ${res.status}).` };
  } catch {
    return { error: "Network error — no build token issued." };
  }
}

async function fetchDrafts(): Promise<DraftSummary[] | null> {
  try {
    const res = await fetch("/api/worlds/drafts", { cache: "no-store" });
    return res.ok ? ((await res.json()) as DraftSummary[]) : null;
  } catch {
    return null; // the next tick will try again
  }
}
const INSTALL = ["claude plugin marketplace add ./claude-plugin", "claude plugin install agentsim-worldbuilder"];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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

export function PluginGenerate({ agentName, onReview, initialDrafts = [] }: { agentName: string; onReview: (draft: PluginDraft) => void; initialDrafts?: DraftSummary[] }) {
  const origin = useOrigin();
  const [token, setToken] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>(initialDrafts);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** One token per plugin run: `register_agent` refuses without a live one. */
  const newToken = () =>
    issueToken().then((r) => {
      if ("token" in r) setToken(r.token);
      else setError(r.error);
    });

  // Issued on the way in so the step never shows an empty token field; drafts polled while it is open.
  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      fetchDrafts().then((d) => {
        if (cancelled) return;
        if (d) setDrafts(d);
        setNow(Date.now());
      });
    void issueToken().then((r) => {
      if (cancelled) return;
      if ("token" in r) setToken(r.token);
      else setError(r.error);
    });
    void tick();
    const t = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const review = async (d: DraftSummary) => {
    setBusy(d.id);
    setError(null);
    try {
      const res = await fetch(`/api/worlds/drafts/${encodeURIComponent(d.id)}`, { cache: "no-store" });
      if (!res.ok) return setError("That draft has expired — drafts live in memory for two hours. Run the plugin again.");
      const data = (await res.json()) as Omit<PluginDraft, "token" | "client" | "repo">;
      onReview({ ...data, token: d.token, client: d.client, repo: d.repo });
    } catch {
      setError("Network error — the draft could not be loaded.");
    } finally {
      setBusy(null);
    }
  };

  const prompt = `Use agentsim-worldbuilder to build a test world for ${agentName}. Build token: ${token ?? "…"}`;
  const mcpUrl = origin ? `${origin}/mcp/worlds` : "";

  return (
    <div>
      <h2 className="font-heading text-h3 font-semibold">Run the worldbuilder plugin</h2>
      <p className="mt-2 max-w-3xl text-body text-muted-foreground">
        Install the plugin once, point it at this AgentSim, then ask it from your agent&apos;s own repo. It reads your tools, your schema, the third-party MCP servers you integrate and the Mandates your policy docs state, and drafts the World&apos;s structure here. It writes no Scenario and no seed row — those are generated on the World afterwards, once you have reviewed what it built.
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
          <p className="mt-2 text-caption text-muted-foreground">Single use, expires in an hour. It is what lets the plugin spend a model call here, so drafting a World needs this workspace rather than just the URL.</p>
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
        <p className={eyebrow}>Drafts · one per plugin run · refreshes every 5 s</p>
        {drafts.length === 0 ? (
          <p className="mt-3 rounded-panel border border-dashed border-border bg-background/60 px-5 py-4 text-body text-muted-foreground">
            No drafts yet. When the plugin calls <span className="font-label">register_agent</span>, its draft appears here.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {drafts.map((d) => {
              const mine = d.token === token;
              return (
                <li key={d.id} className={`animate-line-in flex flex-wrap items-center gap-4 rounded-panel border bg-background px-4 py-3 ${mine ? "border-primary/60" : "border-border"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-label text-caption text-foreground">{d.id}</span>
                      <span className={`rounded-full border px-2 py-0.5 font-label text-[10px] uppercase ${d.valid ? "border-warning/50 text-warning" : "border-danger/50 text-danger"}`}>{d.valid ? "awaiting review" : plural(d.errorCount, "error")}</span>
                      {mine && <span className="font-label text-[10px] uppercase text-primary">this token</span>}
                    </div>
                    <p className="mt-1 text-caption text-muted-foreground">
                      {d.repo ?? d.name} · {d.client ?? "unknown client"} · {relativeTime(new Date(d.createdAt).toISOString(), now)} · {plural(d.tools, "tool")}, {plural(d.entities, "entity", "entities")}, {plural(d.mandates, "Mandate")}
                    </p>
                  </div>
                  <Button variant="outline" disabled={busy !== null} onClick={() => void review(d)}>
                    {busy === d.id ? "Loading…" : "Review"} <Icon name="arrow-right" className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-control border border-danger/50 bg-danger/10 px-3 py-2 text-caption text-danger"><Icon name="alert" className="mt-0.5 size-4 shrink-0" /> {error}</p>}
      </section>
    </div>
  );
}
