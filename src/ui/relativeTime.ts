/**
 * "just now" | "n min ago" | "n h ago" | "n d ago", floored — the mock's When column. Computed on
 * the server with one `now` for the whole page, so the server render and hydration agree.
 */
export function relativeTime(iso: string, now: number): string {
  const t = Date.parse(iso);
  const s = Number.isNaN(t) ? 0 : Math.floor((now - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
