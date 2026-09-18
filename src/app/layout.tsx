import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import { geistMono, geistSans } from "@/theme/fonts";
import "./globals.css";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "AgentSim", template: "%s" },
  description: "Adversarial simulation for AI agents: run your agent in a simulated business, attack the data it reads, and score what it did with deterministic Checks.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
