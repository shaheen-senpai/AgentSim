// The idle countdown, as arithmetic.
//
// A BYO Run finishes itself when nothing has happened for `idleTimeoutMs` — the timer is armed on
// creation and re-armed by every Event (`src/runner/registry.ts`), so the deadline is measured from
// the last Event's `endedAt`, or from the Run's creation while there are no Events yet. Pure, and
// tested in `tests/ui/idle.test.ts`; the components only supply `now`.

type IdleRun = {
  idleTimeoutMs: number | null;
  createdAt: string;
  events: { endedAt: number }[];
};

/** ms left before the idle timer fires; `null` when the Run has no idle timeout at all. */
export function idleRemainingMs(run: IdleRun, now: number = Date.now()): number | null {
  if (run.idleTimeoutMs === null) return null;
  const last = run.events.at(-1)?.endedAt ?? new Date(run.createdAt).getTime();
  return run.idleTimeoutMs - (now - last);
}

/** `mm:ss`, never negative — a countdown that has run out reads `0:00` rather than going backwards. */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The countdown as it is shown, or `null` when there is nothing to count down to. */
export function idleLabel(run: IdleRun, now: number = Date.now()): string | null {
  const remaining = idleRemainingMs(run, now);
  return remaining === null ? null : mmss(remaining);
}
