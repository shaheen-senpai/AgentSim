"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrentSection } from "./navigation";
import { agentLabel } from "@/runner/agentRef";
import type { RunRecord } from "./types";
import { mono, serif } from "./styles";

const NAV = [
  { href: "/runs", label: "Runs" },
  { href: "/worlds", label: "Worlds" },
  { href: "/connect", label: "Connect" },
];


export function Header({ run }: { run: RunRecord | null }) {
  const pathname = usePathname();
  return (
    <header className="flex items-center gap-4 h-12 px-5 border-b border-[#E3E0D5] bg-white">
      <div className="font-extrabold tracking-tight">AgentSim</div>
      <nav className="flex items-center gap-1 text-[13px]" aria-label="Sections">
        {NAV.map((n) => {
          const current = isCurrentSection(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={current ? "page" : undefined}
              className={`rounded px-2 py-1 border-b-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B1A17] ${
                current ? "font-semibold text-[#1B1A17] border-[#1B1A17]" : "border-transparent text-[#6E6B60] hover:text-[#1B1A17] hover:border-[#E3E0D5]"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      {run ? (
        <>
          <span className="text-[#6E6B60]">/</span>
          <span className="text-xs border border-[#E3E0D5] rounded-full px-2 py-0.5">{run.packName}</span>
          <div className={`${serif} text-[20px] font-medium truncate max-w-[280px]`}>{run.scenarioTitle}</div>
          <span className={`${mono} text-xs text-[#6E6B60]`}>{run.id}</span>
          <div className="flex-1" />
          <span className="text-xs border border-[#E3E0D5] rounded-full px-2 py-0.5">Agent: {agentLabel(run.agent)}</span>
          <span className={`text-xs rounded-full px-2 py-0.5 border ${run.attack ? "border-[#1B1A17]" : "border-[#E3E0D5]"}`}>Attack: {run.attack ? "on" : "off"}</span>
        </>
      ) : (
        <div className="flex-1" />
      )}
    </header>
  );
}
