// The marketing typefaces. next/font needs one static call per family, so a theme swap means
// changing the imports here and then pointing tokens.css's `--font-heading/body/label` at the new
// CSS variables. The console keeps its own fonts (declared in src/app/layout.tsx).
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

/** Class list that makes every `--font-*` variable in tokens.css resolve. Put it on the page root. */
export const marketingFontVariables = `${spaceGrotesk.variable} ${jetbrainsMono.variable}`;
