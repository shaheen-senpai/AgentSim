"use client";
// A dumb text-in/text-out editor: a `<textarea>` with a synced line-number gutter, plus the
// `ValidationError[]` for its own file listed underneath. `PackEditor.tsx` owns all the state
// (which file this is, whether it is dirty, what the last Validate/Save returned) and I/O
// (`fetch`); this component never talks to the network or the pack format, so the same component
// serves `pack.yaml`/`seed.yaml`/`tools.yaml` (YAML) and `agents/<v>.md` (plain text) alike.
import { useId, useMemo, useRef, type KeyboardEvent, type UIEvent } from "react";
import type { ValidationError } from "@/engine/pack";
import { errorLine } from "./editorLogic";

const LINE_HEIGHT = 20; // px — shared by the gutter and the textarea so their rows line up

export function YamlEditor({
  value,
  onChange,
  errors,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  errors: ValidationError[];
  label: string;
}) {
  const reactId = useId();
  const textareaId = `${reactId}-yaml`;
  const errorsId = `${reactId}-yaml-errors`;
  const gutterRef = useRef<HTMLDivElement>(null);

  const lineCount = useMemo(() => Math.max(1, value.split("\n").length), [value]);
  const errorLines = useMemo(
    () => new Set(errors.map((e) => errorLine(e.message)).filter((n): n is number => n !== null)),
    [errors],
  );

  function handleScroll(e: UIEvent<HTMLTextAreaElement>) {
    if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
  }

  // `Tab` inserts two spaces at the caret and keeps focus in the textarea, instead of the browser's
  // default of moving focus to the next element. `Shift+Tab` is deliberately left unhandled — it
  // falls through to the browser default (move focus to the previous element) rather than
  // outdenting, so keyboard users always have a way to tab *out* of the editor.
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab" || e.shiftKey) return;
    e.preventDefault();
    const target = e.currentTarget;
    const { selectionStart, selectionEnd } = target;
    const next = value.slice(0, selectionStart) + "  " + value.slice(selectionEnd);
    onChange(next);
    // The textarea is controlled, so the DOM value only catches up once React re-renders with the
    // new `value` prop; restoring the caret has to wait for that paint.
    requestAnimationFrame(() => {
      target.selectionStart = target.selectionEnd = selectionStart + 2;
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={textareaId} className="text-[12px] font-semibold text-[#1B1A17]">
        {label}
      </label>
      <div className="flex border border-[#E3E0D5] rounded overflow-hidden bg-white">
        <div
          ref={gutterRef}
          aria-hidden="true"
          className={`mono text-[11px] text-right select-none text-[#6E6B60] bg-[#F7F5EF] border-r border-[#E3E0D5] px-2 py-2 overflow-hidden shrink-0 min-h-[280px] max-h-[70vh]`}
          style={{ lineHeight: `${LINE_HEIGHT}px` }}
        >
          {Array.from({ length: lineCount }, (_, i) => i + 1).map((n) => (
            <div key={n} className={errorLines.has(n) ? "text-[#B23A22] bg-[#FBEAE7] font-semibold -mx-2 px-2" : undefined}>
              {n}
            </div>
          ))}
        </div>
        {/* `resize-y` is deliberately omitted: the gutter has no way to grow with a user-driven
            textarea resize, and a mismatched pair is worse than a fixed, internally-scrollable box. */}
        <textarea
          id={textareaId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          aria-describedby={errors.length > 0 ? errorsId : undefined}
          className={`mono flex-1 text-[12px] px-2 py-2 outline-none resize-none min-h-[280px] max-h-[70vh] overflow-auto`}
          style={{ lineHeight: `${LINE_HEIGHT}px` }}
          rows={20}
        />
      </div>
      {errors.length > 0 && (
        <ul id={errorsId} className="flex flex-col gap-0.5 border border-[#B23A22] bg-[#FBEAE7] rounded p-2">
          {errors.map((e, i) => (
            <li key={`${e.path}-${i}`} className="text-[11.5px] text-[#B23A22]">
              <span className="mono">{e.path || "(file)"}</span> — {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
