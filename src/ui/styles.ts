// Shared class-name and color constants — every component under src/ui (outside src/ui/worlds and
// src/ui/connect, which have their own local styling) builds its markup from these rather than
// picking its own colors, so a palette change happens in one file.
export const panel = "bg-white border border-[#E3E0D5] rounded-lg shadow-[0_1px_2px_rgba(27,26,23,0.06),0_4px_12px_rgba(27,26,23,0.04)]";
export const heading = "text-[11px] uppercase tracking-[.08em] text-[#6E6B60] font-semibold";
export const mono = "font-mono";
/** The display serif — headlines only. Never body text, never a button, never data. */
export const serif = "font-[family-name:var(--font-fraunces)]";
export const RED = "#B23A22";

// Semantic status colors — soft pastel fill + a matching, readable foreground. Used for Violations,
// PASS/FAIL-shaped states, and the "Capped" badge; never a solid, saturated fill.
export const dangerBg = "#FBEAE7";
export const dangerFg = "#B23A22";
export const successBg = "#E7F4EA";
export const successFg = "#1E7A43";
export const warningBg = "#FDF3DF";
export const warningFg = "#8A5A12";
/** The shared shape/color classes for a small status badge — pair with the site's own padding/text size. */
export const dangerPill = "rounded-full bg-[#FBEAE7] text-[#B23A22]";

// The form vocabulary the Worlds and Connect pages share: one dark primary button, one field
// treatment, one label, one hint. Every interactive element carries the same focus ring, so a
// keyboard user sees the same outline wherever they are.
export const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B1A17]";
export const primaryButton = `h-10 rounded-full bg-[#1B1A17] text-white font-semibold disabled:opacity-50 px-4 text-[13px] ${focusRing}`;
export const secondaryButton = `h-10 rounded-full bg-white border border-[#E3E0D5] text-[#1B1A17] px-4 text-[13px] hover:border-[#1B1A17] disabled:opacity-50 ${focusRing}`;
export const field = "rounded border border-[#E3E0D5] bg-white px-2 py-1.5 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1B1A17]";
export const label = "text-[12px] font-semibold text-[#1B1A17]";
export const hint = "text-[11px] text-[#6E6B60]";

/** The small rounded status/count tag used on Scenario and Mandate cards. */
export const miniTag = "text-[10.5px] text-[#6E6B60] bg-[#F7F5EF] border border-[#E3E0D5] rounded-full px-2 py-0.5";
/** The quoted-block treatment for a Scenario's Policy text — same values `MandateStep.tsx` (the wizard's Mandate step) already established; keep both in sync if you change this. */
export const policyQuote = "bg-[#F7F5EF] border border-[#E3E0D5] border-l-[3px] border-l-[#1B1A17] rounded-r-lg px-4.5 py-4 text-[13.5px] leading-relaxed whitespace-pre-line";
