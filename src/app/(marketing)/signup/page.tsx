import type { Metadata } from "next";
import { AuthCard } from "@/marketing/AuthCard";

export const metadata: Metadata = { title: "Sign up · AgentSim" };

export default function SignUpPage() {
  return <AuthCard mode="signup" />;
}
