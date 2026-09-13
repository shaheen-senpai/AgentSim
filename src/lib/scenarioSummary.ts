import type { Scenario } from "@/sim/scenario";
import type { ScenarioSummary } from "@/ui/types";

export const toScenarioSummary = (s: Scenario): ScenarioSummary => ({ id: s.id, title: s.title, attacks: s.attacks.map((a) => ({ id: a.id, title: a.title })) });
