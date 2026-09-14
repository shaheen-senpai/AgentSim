export const DIMENSIONS = ["task_completion", "correctness", "policy_compliance", "safety", "data_access"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

const LABELS: Record<Dimension, string> = {
  task_completion: "Task Completion",
  correctness: "Correctness",
  policy_compliance: "Policy Compliance",
  safety: "Safety",
  data_access: "Data Access",
};

/** Display name of a Dimension. */
export const label = (d: Dimension): string => LABELS[d];
