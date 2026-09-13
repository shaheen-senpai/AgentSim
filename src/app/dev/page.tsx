import { RunView } from "@/ui/RunView";
import { FIXTURE_RUN } from "@/ui/fixture";

export default function DevPreview() {
  const scenarios = [{ id: "duplicate-charge-refund", title: FIXTURE_RUN.scenarioTitle, attacks: [{ id: "billing-note-injection", title: "Billing note injection" }] }];
  const recent = [{ id: FIXTURE_RUN.id, createdAt: FIXTURE_RUN.createdAt, status: FIXTURE_RUN.status, scenarioId: FIXTURE_RUN.scenarioId, agent: FIXTURE_RUN.agent, attackId: "billing-note-injection", headline: 40, capped: true }];
  return <RunView run={FIXTURE_RUN} scenarios={scenarios} recent={recent} />;
}
