// The marketing shell: landing, sign-in and sign-up. It owns the dark theme and the marketing
// typefaces so the console (light, Geist) is untouched. Tokens live in src/theme/tokens.css.
import type { Metadata } from "next";
import { ThemeRoot } from "@/theme/ThemeRoot";

export const metadata: Metadata = {
  title: "AgentSim | The exam room for AI agents",
  description: "Run clean and poisoned shifts, grade the company ledger, and approve AI agents with evidence.",
  openGraph: {
    title: "AgentSim | The exam room for AI agents",
    description: "The ticket is resolved. The company is not. Test AI agents against deterministic business outcomes.",
    type: "website",
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <ThemeRoot>{children}</ThemeRoot>;
}
