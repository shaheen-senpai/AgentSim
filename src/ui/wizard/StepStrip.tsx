"use client";
// The wizard's step chips (design/agentsim-console.html `renderStrip` 2253-2264): done chips show
// ✓ and can be revisited; future chips are inert.
import { Fragment } from "react";

export function StepStrip({ labels, current, onSelect }: { labels: string[]; current: number; onSelect: (step: number) => void }) {
  return (
    <div className="steps" role="tablist" aria-label="New run steps">
      {labels.map((label, i) => {
        const state = i === current ? " current" : i < current ? " done" : "";
        return (
          <Fragment key={label}>
            <button
              type="button"
              role="tab"
              aria-selected={i === current}
              disabled={i > current}
              className={`step-chip${state}`}
              style={{ cursor: i > current ? "default" : "pointer" }}
              onClick={() => onSelect(i)}
            >
              <span className="num">{i < current ? "✓" : i + 1}</span>
              {label}
            </button>
            {i < labels.length - 1 && <div className="step-line" />}
          </Fragment>
        );
      })}
    </div>
  );
}
