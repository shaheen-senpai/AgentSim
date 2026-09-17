import type { CSSProperties } from "react";

/** Style for a staggered reveal child: `<li style={stagger(i)} data-reveal-child>` (see effects.css). */
export function stagger(index: number): CSSProperties {
  return { ["--reveal-index" as string]: index } as CSSProperties;
}
