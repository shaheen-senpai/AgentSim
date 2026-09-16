// The `/worlds/[id]` tab strip. Plain links that set `?tab=` — no client JS, no state of its own:
// the server component re-renders the page for the chosen tab, and `aria-current="page"` marks it.
//
// `errorTabs` (Task 17) is optional and purely additive: the read-only page renders this with no
// errors to show, so it passes nothing and gets the original strip; `PackEditor` (a client
// component) renders it a second way, live, with the tabs whose file failed the last Validate/Save
// marked — a dot plus screen-reader text, never colour alone.
//
// `onSelect` (Task 18) is the same strip over a pack that has no URL yet: the generated draft on
// `/worlds/new` lives entirely in client state, so its tabs are buttons that move local state
// instead of links that would navigate away and lose the draft. Only a client component can pass
// it; without it this renders exactly as before, links and all.
import Link from "next/link";
import { tabHref, tabLabel, WORLD_TABS, type WorldTab } from "./packView";

export function PackTabs({
  packId,
  current,
  errorTabs,
  onSelect,
}: {
  packId: string;
  current: WorldTab;
  errorTabs?: ReadonlySet<WorldTab>;
  onSelect?: (tab: WorldTab) => void;
}) {
  return (
    <nav aria-label="World pack sections" className="flex items-end gap-1 border-b border-[#E3E0D5]">
      {WORLD_TABS.map((tab) => {
        const active = tab === current;
        const hasError = errorTabs?.has(tab) ?? false;
        const className = `-mb-px rounded-t border border-b-0 px-3 py-1.5 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B1A17] ${
          active ? "bg-white border-[#E3E0D5] font-semibold text-[#1B1A17]" : "border-transparent text-[#6E6B60] hover:text-[#1B1A17]"
        }`;
        const label = (
          <>
            {tabLabel(tab)}
            {hasError && (
              <>
                <span aria-hidden="true" className="ml-1 text-[#B23A22]">●</span>
                <span className="sr-only"> (has validation errors)</span>
              </>
            )}
          </>
        );
        return onSelect ? (
          <button key={tab} type="button" onClick={() => onSelect(tab)} aria-current={active ? "page" : undefined} className={className}>
            {label}
          </button>
        ) : (
          <Link key={tab} href={tabHref(packId, tab)} aria-current={active ? "page" : undefined} className={className}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
