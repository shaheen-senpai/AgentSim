"use client";
// One copy button, used by every snippet and by the Task Brief.
//
// Copying is the whole interaction on this page, so the result has to be announced rather than
// only shown: the confirmation lives in a `role="status"` region that screen readers read out, and
// a clipboard the browser refuses (an insecure origin, a denied permission) says so instead of
// pretending it worked.
import { useEffect, useRef, useState } from "react";

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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button type="button" onClick={copy} className="btn btn-ghost copybtn">
        {label}
      </button>
      <span role="status" aria-live="polite" style={{ fontSize: 11 }}>
        {state === "copied" && <span style={{ color: "var(--success-fg)", fontWeight: 600 }}>{what} copied</span>}
        {state === "failed" && <span style={{ color: "var(--danger-fg)", fontWeight: 600 }}>Could not copy — select it and copy by hand</span>}
      </span>
    </span>
  );
}
