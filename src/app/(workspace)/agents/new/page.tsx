import type { Metadata } from "next";
import { CreateAgentForm } from "@/workspace/CreateAgentForm";

export const metadata: Metadata = { title: "Create agent · AgentSim" };

export default function NewAgentRoute() {
  return <CreateAgentForm />;
}
