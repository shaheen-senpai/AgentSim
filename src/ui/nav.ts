// The sidebar's four items and which one a pathname lights up. Pure, so the mapping is tested
// without a DOM; `Sidebar.tsx` only renders it.
export type NavKey = "runs" | "compare" | "wizard" | "world";

export const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: "runs", href: "/", label: "Runs" },
  { key: "compare", href: "/compare", label: "Compare" },
  { key: "wizard", href: "/runs/new", label: "New run" },
  { key: "world", href: "/worlds", label: "World" },
];

/** `/runs/new` is its own item; every other `/runs/*` belongs to Runs. */
export function activeNav(pathname: string): NavKey | null {
  const p = pathname.split("?")[0];
  if (p === "/runs/new") return "wizard";
  if (p === "/" || p.startsWith("/runs")) return "runs";
  if (p.startsWith("/compare")) return "compare";
  if (p.startsWith("/worlds")) return "world";
  return null;
}
