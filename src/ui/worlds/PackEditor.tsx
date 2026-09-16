"use client";
// The client island for `/worlds/[id]` (Task 17): owns the whole pack `files` map, the tab strip
// (so it can mark tabs with validation errors), Validate/Save, and the unsaved-changes guard. The
// page (a Server Component) still renders every read-only tab body — `EntityBrowser`, `ToolCards`,
// `ScenarioCards`, `AgentPrompts`, `EntityMap` via `Body` in `page.tsx` — and hands this component
// only the current tab's rendered output as `children`; this component never imports or duplicates
// any of them. When a tab is "in edit mode" it swaps that slot for `YamlEditor`(s) instead.
//
// No value import of `@/engine/pack` — only `import type` (erased) and the browser-safe
// `./editorLogic` / `./packView` / `./PackTabs` / `./YamlEditor`. `files`/`initialTab` arrive as
// plain serializable props from the Server Component page, per Next's Server → Client boundary.
//
// Task 18 adds the optional `draft` prop: the same editor over a pack that does not exist yet (the
// draft `/worlds/new` gets back from the generator). It changes four things and nothing else —
// tabs move local state instead of navigating, every tab is a YAML editor because there is no
// parsed pack to render read-only, the primary action is the caller's `submit` rather than
// `PUT /api/worlds/<id>`, and the generator's leftover validation errors are shown on arrival.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ValidationError } from "@/engine/pack";
import { mono } from "@/ui/styles";
import {
  filesEqual,
  groupErrorsByFile,
  isValidScenarioId,
  scenarioFileKey,
  scenarioSkeleton,
  tabFileKey,
  tabsWithErrors,
} from "./editorLogic";
import type { WorldTab } from "./packView";
import { PackTabs } from "./PackTabs";
import { YamlEditor } from "./YamlEditor";

const PRIMARY_BUTTON =
  "h-8 rounded bg-[#1d1d1b] text-white font-semibold disabled:opacity-50 px-3 text-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b]";
const SECONDARY_BUTTON =
  "h-8 rounded border border-[#cfcfcb] bg-white text-[#1d1d1b] font-semibold px-3 text-[12px] hover:bg-[#f4f4f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b]";
const LINK_BUTTON = "text-[11px] text-[#c8321e] underline decoration-dotted hover:decoration-solid";

function scenarioKeysOf(files: Record<string, string>): string[] {
  return Object.keys(files)
    .filter((k) => k.startsWith("scenarios/") && k.endsWith(".yaml"))
    .sort();
}

function agentKeysOf(files: Record<string, string>): string[] {
  return Object.keys(files)
    .filter((k) => k.startsWith("agents/") && k.endsWith(".md"))
    .sort();
}

/** `/worlds/new`'s use of this editor: a pack that has no URL yet and is created, not saved. */
export type DraftMode = {
  /** Label of the primary action — "Create world". */
  submitLabel: string;
  /** Creates the pack from these files; `errors` are shown when it refuses. */
  submit: (files: Record<string, string>) => Promise<{ ok: boolean; errors: ValidationError[] }>;
  /** False while the caller is not ready (no valid world id typed yet) — the primary action is disabled. */
  canSubmit: boolean;
  /** What the draft still gets wrong, shown before the human has touched anything. */
  initialErrors?: ValidationError[];
};

export function PackEditor({
  worldId,
  principal,
  initialTab,
  files: initialFiles,
  draft,
  children,
}: {
  worldId: string;
  /** `pack.meta.principal` — the only ingredient the "Add scenario" skeleton needs from the pack. */
  principal: string;
  initialTab: WorldTab;
  files: Record<string, string>;
  draft?: DraftMode;
  children?: ReactNode;
}) {
  const router = useRouter();
  // The page re-renders on every `?tab=` navigation and hands this already-mounted component a
  // fresh `initialTab` prop — no local echo needed, it is always the current tab. A draft has no
  // URL to carry the tab, so there the strip moves this local state instead.
  const [draftTab, setDraftTab] = useState<WorldTab>(initialTab);
  const tab = draft ? draftTab : initialTab;

  const [files, setFiles] = useState<Record<string, string>>(initialFiles);
  const [savedFiles, setSavedFiles] = useState<Record<string, string>>(initialFiles);
  const [editingTabs, setEditingTabs] = useState<ReadonlySet<WorldTab>>(() => new Set());
  const [errors, setErrors] = useState<ValidationError[]>(draft?.initialErrors ?? []);
  const [lastAction, setLastAction] = useState<"validate" | "save" | null>(draft?.initialErrors ? "validate" : null);
  const [saveOk, setSaveOk] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  const dirty = useMemo(() => !filesEqual(files, savedFiles), [files, savedFiles]);
  const errorsByFile = useMemo(() => groupErrorsByFile(errors), [errors]);
  const errorTabs = useMemo(() => tabsWithErrors(errors), [errors]);
  const scenarioKeys = useMemo(() => scenarioKeysOf(files), [files]);
  const agentKeys = useMemo(() => agentKeysOf(files), [files]);

  // Set for the moment between "Create" succeeding and the caller navigating to the new World, so
  // the guard below does not ask the human whether they really want to leave the page they just
  // asked to leave. A ref, not state: the navigation can begin before React re-renders.
  const leaving = useRef(false);

  // The team's edits are lost on a hard navigation unless we warn first — text state ("Unsaved
  // changes") conveys the same thing for anyone not relying on this browser-native prompt. A draft
  // is unsaved by definition: nothing of it exists on disk until Create, so it always warns.
  useEffect(() => {
    if (!dirty && !draft) return;
    function handler(e: BeforeUnloadEvent) {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, draft]);

  function updateFile(key: string, value: string) {
    setFiles((f) => ({ ...f, [key]: value }));
  }

  function toggleEdit(t: WorldTab) {
    setEditingTabs((s) => {
      const next = new Set(s);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  async function handleValidate() {
    setPending(true);
    try {
      const res = await fetch("/api/worlds/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files }),
      });
      const data = (await res.json()) as { ok: boolean; errors: ValidationError[] };
      setErrors(data.errors ?? []);
      setLastAction("validate");
      setSaveOk(null);
    } catch {
      setErrors([{ file: "", path: "", message: "Network error while validating — the pack was not checked." }]);
      setLastAction("validate");
      setSaveOk(null);
    } finally {
      setPending(false);
    }
  }

  /** Writes the files to the pack's own endpoint. A draft goes to `draft.submit` instead. */
  async function putFiles(): Promise<{ ok: boolean; errors: ValidationError[] }> {
    const res = await fetch(`/api/worlds/${worldId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files }),
    });
    if (res.ok) return { ok: true, errors: [] };
    const data = (await res.json().catch(() => ({ errors: [] as ValidationError[] }))) as { errors?: ValidationError[] };
    return { ok: false, errors: data.errors ?? [] };
  }

  async function handleSave() {
    setPending(true);
    try {
      const outcome = draft ? await draft.submit(files) : await putFiles();
      leaving.current = Boolean(draft) && outcome.ok; // a created draft is on its way to /worlds/<id>
      setErrors(outcome.errors);
      setLastAction("save");
      setSaveOk(outcome.ok);
      if (outcome.ok && !draft) {
        setSavedFiles(files);
        router.refresh(); // re-fetches the pack server-side so the read-only tabs show what was saved
      }
    } catch {
      const what = draft ? "creating" : "saving";
      setErrors([{ file: "", path: "", message: `Network error while ${what} — nothing was written; your text is unchanged.` }]);
      setLastAction("save");
      setSaveOk(false);
    } finally {
      setPending(false);
    }
  }

  function handleAddScenario() {
    const raw = window.prompt("New scenario id (lowercase letters, digits and hyphens, e.g. password-reset):");
    if (raw === null) return;
    const id = raw.trim();
    if (!isValidScenarioId(id)) {
      window.alert(`"${raw}" is not a valid scenario id. Use lowercase letters, digits and hyphens, starting with a letter or digit.`);
      return;
    }
    const key = scenarioFileKey(id);
    if (key in files) {
      window.alert(`A scenario with id "${id}" already exists.`);
      return;
    }
    setFiles((f) => ({ ...f, [key]: scenarioSkeleton({ id, principal }) }));
    setEditingTabs((s) => new Set(s).add("scenarios"));
  }

  function handleDeleteScenario(key: string) {
    if (!window.confirm(`Delete ${key}? It is removed from the pack the next time you Save.`)) return;
    setFiles((f) => {
      const next = { ...f };
      delete next[key];
      return next;
    });
  }

  function renderStatus() {
    if (lastAction === null) return <p className="text-[#6b6b66]">Not yet validated.</p>;
    if (errors.length === 0) {
      const done = draft ? "Created." : "Saved.";
      return <p className="text-[#2f7d4f] font-semibold">{lastAction === "save" ? done : "Valid — no errors."}</p>;
    }
    const fileCount = Object.keys(errorsByFile).length;
    return (
      <div className="border border-[#c8321e] bg-[#fbeeea] rounded p-2 flex flex-col gap-1.5">
        <p className="text-[#c8321e] font-semibold">
          {lastAction === "save" ? (draft ? "Not created — " : "Save failed — ") : ""}
          {errors.length} {errors.length === 1 ? "error" : "errors"} across {fileCount} {fileCount === 1 ? "file" : "files"}.
        </p>
        <ul className="flex flex-col gap-1">
          {Object.entries(errorsByFile).map(([file, fileErrors]) => (
            <li key={file}>
              <span className={`${mono} text-[11px] font-semibold`}>{file}</span>
              <ul className="flex flex-col gap-0.5 pl-3">
                {fileErrors.map((e, i) => (
                  <li key={`${file}-${i}`} className="text-[11px]">
                    {e.path ? <span className={mono}>{e.path}</span> : null}
                    {e.path ? " — " : ""}
                    {e.message}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function renderTabBody() {
    // A draft has no parsed pack behind it, so there is no read-only view to toggle back to: every
    // tab is its editor, and the toggle button is not rendered at all.
    const singleFileKey = tabFileKey(tab);
    if (singleFileKey) {
      const editing = draft ? true : editingTabs.has(tab);
      return (
        <div className="flex flex-col gap-2">
          {!draft && (
          <div className="flex justify-end">
            <button type="button" onClick={() => toggleEdit(tab)} className={SECONDARY_BUTTON}>
              {editing ? "Done editing" : "Edit YAML"}
            </button>
          </div>
          )}
          {editing ? (
            <YamlEditor
              label={singleFileKey}
              value={files[singleFileKey] ?? ""}
              onChange={(v) => updateFile(singleFileKey, v)}
              errors={errorsByFile[singleFileKey] ?? []}
            />
          ) : (
            children
          )}
        </div>
      );
    }

    if (tab === "scenarios") {
      const editing = draft ? true : editingTabs.has("scenarios");
      return (
        <div className="flex flex-col gap-2">
          <div className="flex justify-end gap-2">
            <button type="button" onClick={handleAddScenario} className={SECONDARY_BUTTON}>
              + Add scenario
            </button>
            {!draft && (
            <button type="button" onClick={() => toggleEdit("scenarios")} className={SECONDARY_BUTTON}>
              {editing ? "Done editing" : "Edit YAML"}
            </button>
            )}
          </div>
          {editing ? (
            scenarioKeys.length === 0 ? (
              <p className="text-[12px] text-[#6b6b66]">No scenario files. Use “+ Add scenario” to create one.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {scenarioKeys.map((key) => (
                  <div key={key} className="flex flex-col gap-1.5 border border-[#e6e6e2] rounded p-2">
                    <div className="flex items-center justify-between">
                      <span className={`${mono} text-[11px] text-[#6b6b66]`}>{key}</span>
                      <button type="button" onClick={() => handleDeleteScenario(key)} className={LINK_BUTTON}>
                        Delete scenario
                      </button>
                    </div>
                    <YamlEditor
                      label={key}
                      value={files[key] ?? ""}
                      onChange={(v) => updateFile(key, v)}
                      errors={errorsByFile[key] ?? []}
                    />
                  </div>
                ))}
              </div>
            )
          ) : (
            children
          )}
        </div>
      );
    }

    // tab === "agents"
    const editing = draft ? true : editingTabs.has("agents");
    return (
      <div className="flex flex-col gap-2">
        {!draft && (
        <div className="flex justify-end">
          <button type="button" onClick={() => toggleEdit("agents")} className={SECONDARY_BUTTON}>
            {editing ? "Done editing" : "Edit"}
          </button>
        </div>
        )}
        {editing ? (
          agentKeys.length === 0 ? (
            <p className="text-[12px] text-[#6b6b66]">This World pack ships no Reference Agent prompts to edit.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {agentKeys.map((key) => (
                <YamlEditor key={key} label={key} value={files[key] ?? ""} onChange={(v) => updateFile(key, v)} errors={errorsByFile[key] ?? []} />
              ))}
            </div>
          )
        ) : (
          children
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <PackTabs packId={worldId} current={tab} errorTabs={errorTabs} onSelect={draft ? setDraftTab : undefined} />
      <div className="flex flex-wrap items-center gap-2 bg-white border border-[#cfcfcb] rounded p-2">
        <button type="button" onClick={handleValidate} disabled={pending} className={SECONDARY_BUTTON}>
          Validate
        </button>
        <button type="button" onClick={handleSave} disabled={pending || (draft ? !draft.canSubmit : false)} className={PRIMARY_BUTTON}>
          {draft ? draft.submitLabel : "Save"}
        </button>
        <span className={`text-[12px] font-semibold ${dirty || draft ? "text-[#c8321e]" : "text-[#6b6b66]"}`}>
          {draft ? "Draft — nothing is written until you create it" : dirty ? "Unsaved changes" : "No unsaved changes"}
        </span>
        {pending && <span className="text-[12px] text-[#6b6b66]">Working…</span>}
        {saveOk === false && !pending && (
          <span className="text-[12px] text-[#c8321e]">{draft ? "Not created — see errors below." : "Save failed — see errors below."}</span>
        )}
      </div>
      <div role="status" aria-live="polite" className="text-[12px]">
        {renderStatus()}
      </div>
      <div className="pt-1">{renderTabBody()}</div>
    </div>
  );
}
