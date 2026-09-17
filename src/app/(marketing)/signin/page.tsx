import type { Metadata } from "next";
import { AuthCard } from "@/marketing/AuthCard";

export const metadata: Metadata = { title: "Sign in · AgentSim" };

export default function SignInPage() {
  return <AuthCard mode="signin" />;
}
