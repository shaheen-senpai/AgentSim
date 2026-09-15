"use client";
// The payoff of `/connect` (spec §6.3): the Run exists, and here is exactly what to do with it.
//
// Every URL on this card came back from `POST /api/runs`, which derives them from the request's own
// origin — so whatever reaches this page (localhost, a LAN address, a tunnel) is what the snippets
// carry. Nothing here constructs an origin of its own.
import Link from "next/link";
import type { ReactNode } from "react";
import { heading, hint, mono, panel } from "@/ui/styles";
import { useRun } from "@/ui/useRun";
import { CopyButton } from "./CopyButton";
import { connectorBlock, curlTools, forwarderPy, forwarderTs, mcpAddCommand, mcpJsonConfig, toolsUrl } from "./snippets";
import type { CreatedRun } from "./StartRun";

function Snippet({ title, body, what, language }: { title: string; body: string; what: string; language?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className={heading}>
          {title}
          {language ? <span className="normal-case tracking-normal font-normal"> · {language}</span> : null}
        </span>
        <CopyButton text={body} what={what} />
      </div>
      <pre className={`${mono} text-[11px] leading-[1.5] bg-[#fafaf8] border border-[#cfcfcb] rounded p-2 overflow-x-auto whitespace-pre`}>{body}</pre>
    </div>
  );
}

/** The instructions for the shape the agent said it would connect in — and only that shape. */
function ShapeInstructions({ run }: { run: CreatedRun }): ReactNode {
  if (run.shape === "mcp") {
    return (
      <>
        <p className={hint}>
          One command in Claude Code, or the same server in any MCP client&rsquo;s config. The Task Brief arrives as the server&rsquo;s
          <span className={mono}> instructions</span>, so there is nothing else to paste.
        </p>
        <Snippet title="Add the Run as an MCP server" language="Claude Code" body={mcpAddCommand(run.agentName, run.mcpUrl)} what="Command" />
        <Snippet title="Or, any MCP client" language="JSON" body={mcpJsonConfig(run.agentName, run.mcpUrl)} what="Config" />
      </>
    );
  }

  if (run.shape === "forwarder") {
    return (
      <>
        <p className={hint}>
          Replace the one place your agent executes a tool call. Model, prompts and loop stay exactly as they are; set
          <span className={mono}> AGENTSIM_CALL_URL</span> to switch it on and unset it to switch it off.
        </p>
        <Snippet title="Forwarder" language="TypeScript" body={forwarderTs(run.callUrl)} what="Forwarder" />
        <Snippet title="Forwarder" language="Python" body={forwarderPy(run.callUrl)} what="Forwarder" />
        <Snippet title="What this Run publishes" language="curl" body={curlTools(toolsUrl(run.callUrl))} what="Command" />
      </>
    );
  }

  return (
    <>
      <p className={hint}>
        An agent built straight on the Anthropic Messages API needs no forwarder: pass the Run as an MCP server and the API fetches our tools
        itself. It has to reach us, so put a tunnel in front of this origin if it is a laptop.
      </p>
      <Snippet title="Messages API request" language="JSON" body={connectorBlock(run.mcpUrl)} what="Block" />
    </>
  );
}

export function ConnectionCard({ run }: { run: CreatedRun }) {
  // One second is the spec's cadence: fast enough that the first tool call shows up while someone
  // is still looking at the card, slow enough to be invisible. `useRun` stops polling by itself
  // when the Run leaves "running".
  const { run: live } = useRun(run.id, 1000);
  const events = live?.events.length ?? 0;
  const status = live?.status ?? "running";

  return (
    <section className={`${panel} p-3 flex flex-col gap-3`} aria-labelledby="connection-heading">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 id="connection-heading" className={heading}>
          Connect {run.agentName}
        </h2>
        <span className={`${mono} text-[11px] text-[#6b6b66]`}>{run.id}</span>
      </div>

      <div role="status" aria-live="polite" className="flex items-center gap-2 text-[12px]">
        <span className={`inline-block w-2 h-2 rounded-full ${status === "running" ? "bg-[#2f7d4f]" : "bg-[#6b6b66]"}`} />
        <span className="font-semibold">
          {status === "running" ? "Waiting for your agent" : status === "completed" ? "Finished" : "Failed"} · {events}{" "}
          {events === 1 ? "Event" : "Events"}
        </span>
        <Link
          href={`/runs/${run.id}`}
          className="underline decoration-dotted hover:text-[#1d1d1b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b] rounded"
        >
          Open Run →
        </Link>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className={heading}>Run URL</span>
          <CopyButton text={run.url} what="Run URL" />
        </div>
        <code className={`${mono} text-[11px] bg-[#fafaf8] border border-[#cfcfcb] rounded p-2 break-all`}>{run.url}</code>
      </div>

      <ShapeInstructions run={run} />

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className={heading}>Task Brief</span>
          <CopyButton text={run.taskBrief} what="Task Brief" />
        </div>
        <pre className={`${mono} text-[11px] leading-[1.5] bg-[#fafaf8] border border-[#cfcfcb] rounded p-2 max-h-[220px] overflow-auto whitespace-pre-wrap`}>
          {run.taskBrief}
        </pre>
        <p className={hint}>Whatever normally wakes your agent — this is its input. Over MCP it also arrives as the server&rsquo;s instructions.</p>
      </div>
    </section>
  );
}
