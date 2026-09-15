"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { agentLabel } from "@/runner/agentRef";
import type { RunRecord } from "./types";
import { mono } from "./styles";

const NAV = [
  { href: "/", label: "Runs" },
  { href: "/worlds", label: "Worlds" },
  { href: "/connect", label: "Connect" },
];

function isCurrentSection(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/runs");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Header({ run }: { run: RunRecord | null }) {
  const pathname = usePathname();
  return (
    <header className="flex items-center gap-4 h-12 px-5 border-b border-[#cfcfcb] bg-white">
      <div className="font-extrabold tracking-tight">AgentSim</div>
      <nav className="flex items-center gap-1 text-[13px]" aria-label="Sections">
        {NAV.map((n) => {
          const current = isCurrentSection(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={current ? "page" : undefined}
              className={`rounded px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b] ${
                current ? "font-semibold text-[#1d1d1b]" : "text-[#6b6b66] hover:text-[#1d1d1b]"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      {run ? (
        <>
          <span className="text-[#6b6b66]">/</span>
          <span className="text-xs border border-[#cfcfcb] rounded-full px-2 py-0.5">{run.packName}</span>
          <div className="font-semibold truncate max-w-[280px]">{run.scenarioTitle}</div>
          <span className={`${mono} text-xs text-[#6b6b66]`}>{run.id}</span>
          <div className="flex-1" />
          <span className="text-xs border border-[#cfcfcb] rounded-full px-2 py-0.5">Agent: {agentLabel(run.agent)}</span>
          <span className={`text-xs rounded-full px-2 py-0.5 border ${run.attack ? "border-[#1d1d1b]" : "border-[#cfcfcb]"}`}>Attack: {run.attack ? "on" : "off"}</span>
        </>
      ) : (
        <div className="flex-1" />
      )}
    </header>
  );
}
