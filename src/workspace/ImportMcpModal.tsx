"use client";
// "Import via MCP": the install snippet, what the plugin brings in, and a demo connection that plays
// the handshake and then registers the discovered agent for real through the API.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/marketing/Button";
import { Icon } from "@/marketing/icons";
import type { Agent } from "@/ui/types";
import { createAgent } from "./api";
import { buildHandshake, INSTALL_COMMAND, INSTALL_URL, nextImportCandidate, type HandshakeStep } from "./handshake";
import { Modal } from "./Modal";
import { newWorldId } from "./worlds";
import { detailsFromTools } from "./worldDetail";
import { eyebrow, hint } from "./ui";

type Phase = "idle" | "running" | "saving" | "done" | "error";

export function ImportMcpModal({ open, onClose, existingNames, onImported }: { open: boolean; onClose: () => void; existingNames: string[]; onImported: (agent: Agent) => void }) {
  const candidate = useMemo(() => nextImportCandidate(existingNames), [existingNames]);
  const steps = useMemo(() => buildHandshake(candidate), [candidate]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState<HandshakeStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timers = useRef<number[]>([]);

  const clear = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const reset = useCallback(() => {
    clear();
    setPhase("idle");
    setShown([]);
    setError(null);
  }, [clear]);

  useEffect(() => clear, [clear]);

  const close = () => {
    reset();
    onClose();
  };

  const connect = () => {
    reset();
    setPhase("running");
    steps.forEach((step, i) => {
      timers.current.push(
        window.setTimeout(async () => {
          setShown((s) => [...s, step]);
          if (!step.done) return;
          setPhase("saving");
          const result = await createAgent({
            name: candidate.name,
            version: "mcp",
            shape: "mcp",
            toolAliases: {},
            notes: "Imported through the AgentSim MCP plugin",
            source: "mcp",
            description: candidate.description,
            mandate: candidate.mandate,
            tools: candidate.tools,
            entities: candidate.entities,
            worldIds: [],
            worlds: candidate.worlds.map((w) => ({ ...w, id: newWorldId(), createdAt: new Date().toISOString(), details: detailsFromTools(candidate.tools, candidate.entities, candidate.mandate) })),
          });
          if (result.agent === null) {
            setError(result.error);
            setPhase("error");
            return;
          }
          setPhase("done");
          const agent = result.agent;
          timers.current.push(
            window.setTimeout(() => {
              reset();
              onImported(agent);
            }, 500),
          );
        }, step.at + (i === 0 ? 300 : 0)),
      );
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the text is still selectable */
    }
  };

  const progress = phase === "idle" ? 0 : phase === "done" ? 100 : Math.round((shown.length / steps.length) * 100);
  const busy = phase === "running" || phase === "saving";

  return (
    <Modal open={open} onClose={close} eyebrow="Import via MCP" title="Connect an agent">
      <p className="text-body text-muted-foreground">
        Install the AgentSim MCP plugin next to your agent. It reads the tool surface, entities and mandate your agent already uses — no manual setup.
      </p>

      <div className="mt-5 rounded-control border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className={eyebrow}>Install</span>
          <button type="button" onClick={copy} className="flex cursor-pointer items-center gap-1.5 font-label text-[11px] uppercase text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <Icon name="copy" className="size-3.5" /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto px-4 py-3 font-label text-caption text-foreground">
          <code>{INSTALL_COMMAND}</code>
        </pre>
      </div>
      <p className={hint}>
        Docs and other install options:{" "}
        <a href={INSTALL_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
          {INSTALL_URL.replace("https://", "")} <Icon name="external" className="size-3" />
        </a>
      </p>

      <ul className="mt-5 grid gap-2 text-caption text-muted-foreground sm:grid-cols-3">
        {["Tools, with their input schemas", "Entities the agent reads and writes", "The mandate it is expected to obey"].map((t) => (
          <li key={t} className="flex items-start gap-2 rounded-control border border-border px-3 py-2">
            <Icon name="check" className="mt-0.5 size-3.5 shrink-0 text-primary" /> {t}
          </li>
        ))}
      </ul>

      {phase !== "idle" && (
        <div className="mt-5 overflow-hidden rounded-control border border-border bg-background" aria-live="polite">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className={`${eyebrow} flex items-center gap-2`}>
              <Icon name="terminal" className="size-3.5" /> MCP handshake
            </span>
            <span className="font-label text-[11px] tabular-nums text-primary">{progress}%</span>
          </div>
          <ol className="min-h-[150px] space-y-1.5 px-4 py-3 font-label text-caption">
            {shown.map((s) => (
              <li key={s.at} className={`animate-line-in flex gap-2 ${s.done ? "text-primary" : "text-foreground"}`}>
                <span className="text-muted-foreground" aria-hidden>▸</span>
                <span>{s.text}</span>
              </li>
            ))}
            {busy && (
              <li className="flex items-center gap-2 text-muted-foreground">
                <Icon name="spinner" className="size-3.5 animate-spin" /> {phase === "saving" ? "registering agent…" : "working…"}
              </li>
            )}
            {phase === "error" && (
              <li className="flex gap-2 text-danger">
                <Icon name="alert" className="mt-0.5 size-3.5 shrink-0" /> {error}
              </li>
            )}
          </ol>
          <div className="h-0.5 w-full bg-border" aria-hidden>
            <div className="h-full bg-primary transition-[width] duration-500 ease-soft" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-muted-foreground">
          {phase === "idle" ? `Demo: connecting discovers “${candidate.name}”.` : phase === "done" ? `${candidate.name} is in your workspace.` : " "}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>{phase === "done" ? "Close" : "Cancel"}</Button>
          {phase === "error" ? (
            <Button onClick={connect}>Retry</Button>
          ) : (
            <Button onClick={connect} disabled={busy || phase === "done"}>
              <Icon name="plug" className="size-4" /> {busy ? "Connecting…" : "Connect agent"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
