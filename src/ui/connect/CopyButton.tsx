"use client";
// One copy button, used by every snippet and by the Task Brief.
//
// Copying is the whole interaction on this page, so the result has to be announced rather than
// only shown: the confirmation lives in a `role="status"` region that screen readers read out, and
// a clipboard the browser refuses (an insecure origin, a denied permission) says so instead of
// pretending it worked.
import { useEffect, useRef, useState } from "react";
import { secondaryButton } from "@/ui/styles";

type State = "idle" | "copied" | "failed";

export function CopyButton({ text, label = "Copy", what }: { text: string; label?: string; what: string }) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={copy} className={secondaryButton}>
        {label}
      </button>
      <span role="status" aria-live="polite" className="text-[11px] empty:hidden">
        {state === "copied" && <span className="text-[#2f7d4f] font-semibold">{what} copied</span>}
        {state === "failed" && <span className="text-[#c8321e] font-semibold">Could not copy — select it and copy by hand</span>}
      </span>
    </span>
  );
}
