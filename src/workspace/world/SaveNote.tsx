"use client";
// Validation problems from a pack save, in the workspace's danger palette. Nothing invalid is ever
// written, so this is the only place a failed edit shows up.
import type { ValidationError } from "@/engine/pack";
import { Icon } from "@/marketing/icons";

export function SaveNote({ errors, title = "Not saved" }: { errors: ValidationError[]; title?: string }) {
  if (errors.length === 0) return null;
  return (
    <div role="alert" className="mt-4 flex items-start gap-2 rounded-control border border-danger/50 bg-danger/10 px-4 py-3 text-caption text-danger">
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title} — {errors.length} problem{errors.length === 1 ? "" : "s"}.</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {errors.slice(0, 8).map((e, i) => (
            <li key={i} className="break-words">
              {e.file && <span className="font-label">{e.file}{e.path ? ` · ${e.path}` : ""}: </span>}
              {e.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A plain failure (a network error, an HTTP status) in the same palette. */
export function FailureNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-4 flex items-start gap-2 rounded-control border border-danger/50 bg-danger/10 px-4 py-3 text-caption text-danger">
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" /> {message}
    </p>
  );
}
