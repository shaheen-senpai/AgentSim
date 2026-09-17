"use client";
// The pieces both the Run launcher and the live Run page draw: a copy control, the bridge's
// liveness light, and the MCP commands — folded away, because there is one per source and four
// sources is a wall of shell that buries the one line that matters.
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/marketing/icons";
import { mcpAddCommand, serverName } from "@/ui/connect/snippets";
import type { BridgeProbe } from "./bridge";

export type McpSource = { system: string; url: string };

export function Copy({ text, what }: { text: string; what: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="cursor-pointer rounded-control border border-border px-2 py-1 font-label text-label-sm uppercase text-muted-foreground transition-colors duration-200 hover:border-primary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        Copy
      </button>
      <span role="status" aria-live="polite" className="text-caption">
        {state === "copied" && <span className="text-primary">{what} copied</span>}
        {state === "failed" && <span className="text-danger">Copy it by hand</span>}
      </span>
    </span>
  );
}

/** One shell line in a box, with its own copy button. */
export function Snippet({ text, what }: { text: string; what: string }) {
  return (
    <div className="flex items-center gap-3 rounded-control border border-border bg-background px-3 py-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-caption text-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{text}</code>
      <Copy text={text} what={what} />
    </div>
  );
}

// Written out rather than interpolated: Tailwind only ships a class it can see in the source.
const DOT = { unknown: "bg-border", up: "bg-safe", down: "bg-danger" } as const;
const TEXT = { unknown: "text-muted-foreground", up: "text-safe", down: "text-danger" } as const;

/** The liveness light. `null` while the first check is in flight — never a green dot on no evidence. */
export function BridgeStatus({ probe, checking, onCheck }: { probe: BridgeProbe | null; checking: boolean; onCheck: () => void }) {
  const tone = checking || probe === null ? "unknown" : probe.reachable ? "up" : "down";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-2 font-label text-caption">
        <span className={`size-2 rounded-full ${DOT[tone]} ${checking ? "animate-pulse" : ""}`} aria-hidden />
        <span className={TEXT[tone]}>{checking ? "Checking…" : probe === null ? "Not checked" : probe.reachable ? "Bridge up" : "Bridge down"}</span>
      </span>
      <span className="min-w-0 flex-1 text-caption text-muted-foreground">{probe?.detail ?? "AgentSim will POST the Task Brief to this endpoint and wait for its tool calls."}</span>
      <button
        type="button"
        onClick={onCheck}
        disabled={checking}
        className="cursor-pointer rounded-control border border-border px-3 py-1.5 font-label text-label-sm uppercase text-muted-foreground transition-colors duration-200 hover:border-primary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      >
        Test bridge
      </button>
    </div>
  );
}

/**
 * The other way in, folded shut. One `claude mcp add` per source is correct and unreadable, so it
 * stays behind a disclosure: a team on the bridge never has to scroll past it, and a team on MCP
 * still gets every line, in one place, with the JSON config for clients that are not Claude Code.
 */
export function McpCommands({ name, sources }: { name: string; sources: McpSource[] }) {
  if (sources.length === 0) return null;
  const json = JSON.stringify(
    { mcpServers: Object.fromEntries(sources.map(({ system, url }) => [`${serverName(name)}-${system}`, { type: "http", url }])) },
    null,
    2,
  );
  return (
    <details className="group mt-4 rounded-control border border-border bg-background">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-label text-label-sm uppercase text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <Icon name="plug" className="size-3.5" />
        Or connect over MCP · {sources.length} server{sources.length === 1 ? "" : "s"}
        <span className="ml-auto transition-transform duration-200 group-open:rotate-90" aria-hidden>›</span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-border p-3">
        <p className="text-caption text-muted-foreground">
          One server per source — the same shape a real agent&rsquo;s MCP config already has. The Task Brief arrives as each server&rsquo;s <code className="font-mono">instructions</code>, so there is nothing else to paste.
        </p>
        {sources.map(({ system, url }) => (
          <Snippet key={system} text={mcpAddCommand(`${name} ${system}`, url)} what="Command" />
        ))}
        <span className="mt-1 font-label text-label-sm uppercase text-muted-foreground">Any other MCP client</span>
        <pre className="overflow-x-auto rounded-control border border-border bg-surface p-3 font-mono text-caption leading-relaxed text-muted-foreground">{json}</pre>
      </div>
    </details>
  );
}
