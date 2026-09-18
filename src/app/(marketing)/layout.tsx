// The marketing shell: landing, sign-in and sign-up. It owns the dark theme and the marketing
// typefaces so the console (light, Geist) is untouched. Tokens live in src/theme/tokens.css.
import type { Metadata } from "next";
import { ThemeRoot } from "@/theme/ThemeRoot";

export const metadata: Metadata = {
  title: "AgentSim | Break your agent here, not in production",
  description: "Run your agent in a simulated business, plant an Attack in the data it reads, and score what it did with deterministic Checks and a Trust Score.",
  openGraph: {
    title: "AgentSim | Break your agent here, not in production",
    description: "The ticket is resolved. The company is not. Run a Scenario clean and attacked, and read the Violations before production does.",
    type: "website",
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <ThemeRoot>{children}</ThemeRoot>;
}
