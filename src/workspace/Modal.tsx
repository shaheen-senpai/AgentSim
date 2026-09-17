"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "@/marketing/icons";
import { eyebrow as eyebrowClass } from "./ui";

export function Modal({ open, onClose, eyebrow, title, children, width = "max-w-xl" }: { open: boolean; onClose: () => void; eyebrow?: string; title: string; children: ReactNode; width?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("input, textarea, select, button:not([data-close])")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-background/80 backdrop-blur-sm" onMouseDown={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className={`animate-pop-in relative w-full ${width} rounded-panel border border-border bg-surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            {eyebrow && <p className={`${eyebrowClass} text-primary`}>{eyebrow}</p>}
            <h2 id={`${id}-title`} className="mt-1 font-heading text-h3 font-semibold sm:text-2xl">{title}</h2>
          </div>
          <button type="button" data-close onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-control text-muted-foreground transition-colors duration-200 hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <Icon name="close" className="size-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
