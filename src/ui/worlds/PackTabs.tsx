// The `/worlds/[id]` tab strip. Plain links that set `?tab=` — no client JS, no state of its own:
// the server component re-renders the page for the chosen tab, and `aria-current="page"` marks it.
//
// `errorTabs` (Task 17) is optional and purely additive: the read-only page renders this with no
// errors to show, so it passes nothing and gets the original strip; `PackEditor` (a client
// component) renders it a second way, live, with the tabs whose file failed the last Validate/Save
// marked — a dot plus screen-reader text, never colour alone.
import Link from "next/link";
import { tabHref, tabLabel, WORLD_TABS, type WorldTab } from "./packView";

export function PackTabs({
  packId,
  current,
  errorTabs,
}: {
  packId: string;
  current: WorldTab;
  errorTabs?: ReadonlySet<WorldTab>;
}) {
  return (
    <nav aria-label="World pack sections" className="flex items-end gap-1 border-b border-[#cfcfcb]">
      {WORLD_TABS.map((tab) => {
        const active = tab === current;
        const hasError = errorTabs?.has(tab) ?? false;
        return (
          <Link
            key={tab}
            href={tabHref(packId, tab)}
            aria-current={active ? "page" : undefined}
            className={`-mb-px rounded-t border border-b-0 px-3 py-1.5 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b] ${
              active ? "bg-white border-[#cfcfcb] font-semibold text-[#1d1d1b]" : "border-transparent text-[#6b6b66] hover:text-[#1d1d1b]"
            }`}
          >
            {tabLabel(tab)}
            {hasError && (
              <>
                <span aria-hidden="true" className="ml-1 text-[#c8321e]">●</span>
                <span className="sr-only"> (has validation errors)</span>
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
