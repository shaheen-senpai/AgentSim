"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { heading, serif } from "./styles";

const NAV = [
  { href: "/", label: "Runs" },
  { href: "/worlds", label: "World" },
];

function isCurrentSection(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/runs");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex flex-col gap-5 p-3.5 bg-[#F1EEE4] border-r border-[#E3E0D5] h-screen sticky top-0">
      <div className="flex items-center gap-2 px-1.5">
        <div className="w-[22px] h-[22px] rounded-[6px] bg-[#1B1A17] flex items-center justify-center">
          <span className="w-2 h-2 rounded-sm bg-[#F7F5EF]" />
        </div>
        <b className={`${serif} text-[15px]`}>AgentSim</b>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => {
          const current = isCurrentSection(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={current ? "page" : undefined}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B1A17] ${
                current ? "bg-[#1B1A17] text-white" : "text-[#6E6B60] hover:bg-black/[.04] hover:text-[#1B1A17]"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <div className={`${heading} px-2.5`}>AgentSim</div>
    </aside>
  );
}
