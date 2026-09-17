// The World detail's tab strip (design/agentsim-console.html 1405): plain links that set `?tab=`.
import Link from "next/link";
import { tabHref, tabLabel, WORLD_TABS, type WorldTab } from "./packView";

export function WorldTabs({ packId, current }: { packId: string; current: WorldTab }) {
  return (
    <nav className="tabs" aria-label="World sections">
      {WORLD_TABS.map((t) => (
        <Link key={t} href={tabHref(packId, t)} className={`tab${t === current ? " active" : ""}`} aria-current={t === current ? "page" : undefined}>
          {tabLabel(t)}
        </Link>
      ))}
    </nav>
  );
}
