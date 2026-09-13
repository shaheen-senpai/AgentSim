# Policy lives in the Scenario, not on the agent

The Trust Score judges whether an agent acted "within its authority", so authority has to be defined somewhere. We put the Policy inside the Scenario rather than attaching a permission profile to the agent. One Scenario is then a single source of truth for "what should have happened", the same agent can be tested under different authority by swapping Scenarios, and the adversarial variant is expressible as *same World, same Policy, poisoned data*. The cost is that a real deployment's permissions must be re-expressed per Scenario; we accept that because the Scenario is the unit users author and share.

Rejected: a per-agent permission profile the sim enforces. It would make the sim a policy engine rather than a test environment, and it would hide the policy from the Scenario file that people read to understand a test.
