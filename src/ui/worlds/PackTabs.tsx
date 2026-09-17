// The raw editor's tab strip (`/worlds/[id]/edit`): one tab per file kind, in the mock's `.tabs`
// look. Links set `?tab=`; a draft (no URL yet) passes `onSelect` and gets buttons that move local
// state instead. `errorTabs` marks the tabs whose file failed the last Validate/Save — a dot plus
// screen-reader text, never colour alone.
import Link from "next/link";
import { EDITOR_TABS, editorTabHref, editorTabLabel, type EditorTab } from "./packView";

export function PackTabs({
  packId,
  current,
  errorTabs,
  onSelect,
}: {
  packId: string;
  current: EditorTab;
  errorTabs?: ReadonlySet<EditorTab>;
  onSelect?: (tab: EditorTab) => void;
}) {
  return (
    <nav aria-label="World pack files" className="tabs">
      {EDITOR_TABS.map((tab) => {
        const active = tab === current;
        const hasError = errorTabs?.has(tab) ?? false;
        const className = `tab mono${active ? " active" : ""}`;
        const label = (
          <>
            {editorTabLabel(tab)}
            {hasError && (
              <>
                <span aria-hidden="true" style={{ marginLeft: 4, color: "var(--danger-fg)" }}>●</span>
                <span className="visually-hidden"> (has validation errors)</span>
              </>
            )}
          </>
        );
        return onSelect ? (
          <button key={tab} type="button" onClick={() => onSelect(tab)} aria-current={active ? "page" : undefined} className={className}>
            {label}
          </button>
        ) : (
          <Link key={tab} href={editorTabHref(packId, tab)} aria-current={active ? "page" : undefined} className={className}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
