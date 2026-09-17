"use client";
// The mock's sidebar (design/agentsim-console.html lines 497-522, collapse logic 2425-2449): brand,
// collapse button, four nav items. Collapsed state lives in localStorage("agentsim.nav") and is
// toggled by the button or the `[` key when focus is not in a field.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { activeNav, NAV, type NavKey } from "./nav";

const ICONS: Record<NavKey, React.ReactNode> = {
  agents: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16V8Z" />
      <path d="M3.5 8 12 12.5 20.5 8M12 12.5v8" />
    </svg>
  ),
  runs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  compare: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M8 4H4v16h4M16 4h4v16h-4" />
      <path d="M12 3v18" />
    </svg>
  ),
  wizard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none" />
    </svg>
  ),
  world: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2z" />
      <path d="M12 2v18M4 6.5l8 4.5 8-4.5" />
    </svg>
  ),
};

const STORAGE_KEY = "agentsim.nav";

function inField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest("input, textarea, select, [contenteditable]") !== null;
}

export function Sidebar() {
  const pathname = usePathname();
  const active = activeNav(pathname);
  const [collapsed, setCollapsed] = useState(false);

  // The mock's CSS keys off `.shell.nav-collapsed`, so the class goes on the shell, not this aside.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a persisted preference on mount
    try { setCollapsed(localStorage.getItem(STORAGE_KEY) === "collapsed"); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    document.getElementById("shell")?.classList.toggle("nav-collapsed", collapsed);
    try { localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "expanded"); } catch { /* storage unavailable */ }
  }, [collapsed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey || inField(e.target)) return;
      setCollapsed((c) => !c);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="mark"><span /></div>
        <b>AgentSim</b>
        <button
          type="button"
          className="navcollapse"
          title={`${collapsed ? "Expand" : "Collapse"} menu`}
          aria-label={`${collapsed ? "Expand" : "Collapse"} menu`}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>
      <nav id="mainnav" aria-label="Sections">
        {NAV.map((n) => (
          <Link key={n.key} href={n.href} title={n.label} aria-current={active === n.key ? "page" : undefined} className={`navitem${active === n.key ? " active" : ""}`}>
            {ICONS[n.key]}
            <span className="navlabel">{n.label}</span>
          </Link>
        ))}
      </nav>
      <div className="spacer" />
    </aside>
  );
}
