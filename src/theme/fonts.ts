// The typefaces every themed page reads through tokens.css's `--font-heading/body/label`. One
// family for reading and one mono for labels, both Geist — the same faces the console already
// loads — so the marketing pages, the workspace and the console set type the same way. next/font
// needs one static call per family; to swap a face, change it here and repoint the `--font-*`
// tokens at the new variable.
import { Geist, Geist_Mono } from "next/font/google";

export const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

/** Class list that makes every `--font-*` variable in tokens.css resolve. Put it on the page root. */
export const marketingFontVariables = `${geistSans.variable} ${geistMono.variable}`;
