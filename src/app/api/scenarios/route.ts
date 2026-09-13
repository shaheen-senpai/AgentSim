import { listScenarios } from "@/sim/scenario";
import { toScenarioSummary } from "@/lib/scenarioSummary";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(listScenarios().map(toScenarioSummary));
}
