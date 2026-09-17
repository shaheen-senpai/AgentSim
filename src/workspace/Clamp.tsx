"use client";
// Long prose — an agent's or World's description as the plugin captured it can run to a page —
// shown clamped to a few lines with a toggle. Renders the full text on the server (no layout jump
// when the text is short) and only shows the toggle once the browser confirms it overflows.
import { useEffect, useRef, useState } from "react";

export function Clamp({ text, lines = 4, className = "" }: { text: string; lines?: number; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);

  // Inline rather than a `line-clamp-*` utility: the clamp must hold even before the stylesheet
  // for this component has been (re)built, and whatever the utility set happens to contain.
  const clamp: React.CSSProperties = open
    ? { whiteSpace: "pre-line" }
    : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" };
  return (
    <div className={className}>
      <p ref={ref} style={clamp}>{text}</p>
      {(overflows || open) && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-1.5 cursor-pointer font-label text-[11px] uppercase text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
