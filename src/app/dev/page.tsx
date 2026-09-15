import { toSummary } from "@/runner/store";
import { RunView } from "@/ui/RunView";
import { FIXTURE_RUN } from "@/ui/fixture";

export default function DevPreview() {
  const scenarios = [{ id: "duplicate-charge-refund", packId: FIXTURE_RUN.packId, title: FIXTURE_RUN.scenarioTitle, attacks: [{ id: "billing-note-injection", title: "Billing note injection" }] }];
  return <RunView run={FIXTURE_RUN} scenarios={scenarios} recent={[toSummary(FIXTURE_RUN, true)]} />;
}
