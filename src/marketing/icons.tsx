// Small authored interface icons (24px grid, 1.5px stroke). Decorative by default: pass a `title`
// only when the icon is the sole label of a control.
import type { SVGProps } from "react";

export type IconName =
  | "lock" | "eye" | "plug" | "layers" | "compare" | "file" | "gauge"
  | "arrow-right" | "arrow-left" | "play" | "check" | "box" | "menu" | "close" | "diamond"
  | "search" | "grid" | "list" | "plus" | "globe" | "shield" | "pen" | "terminal" | "copy" | "alert" | "external" | "spinner";

const PATHS: Record<IconName, React.ReactNode> = {
  lock: <><rect x="5" y="11" width="14" height="10" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  plug: <><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8Z" /><path d="M12 17v4" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
  compare: <><path d="M9 4v16M15 4v16" /><path d="m5 8 4-4 4 4M11 16l4 4 4-4" /></>,
  file: <><path d="M7 3h7l5 5v13H7V3Z" /><path d="M14 3v5h5" /><path d="m9 15 2 2 4-4" /></>,
  gauge: <><path d="M4 16a8 8 0 1 1 16 0" /><path d="m12 16 4-6" /><circle cx="12" cy="16" r="1" /></>,
  "arrow-right": <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  play: <path d="M7 5v14l11-7L7 5Z" />,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 5-5" /></>,
  box: <><path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16V8Z" /><path d="M3.5 8 12 12.5 20.5 8M12 12.5v8" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  diamond: <path d="m12 3 9 9-9 9-9-9 9-9Z" />,
  "arrow-left": <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  shield: <><path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6L12 3Z" /><path d="m9 12 2 2 4-4" /></>,
  pen: <><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  terminal: <><path d="m5 7 5 5-5 5" /><path d="M12 17h7" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="1.5" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></>,
  alert: <><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 13v6H5V6h6" /></>,
  spinner: <path d="M12 3a9 9 0 1 0 9 9" />,
};

export function Icon({ name, title, ...rest }: { name: IconName; title?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}
