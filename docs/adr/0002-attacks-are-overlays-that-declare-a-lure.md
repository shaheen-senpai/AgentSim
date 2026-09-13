# Attacks are overlays on a Scenario, and each declares its Lure

An adversarial test is not a second Scenario. It is the base Scenario plus an **Attack**: a named mutation applied to the World at Run start (today: content injected into a document the agent will read). Policy and Checks are untouched, so a clean Run and an attacked Run of the same Scenario are directly comparable — which is the demo.

Each Attack declares its **Lure**, the concrete tool call it is trying to induce. Whether the agent "acted on injected content" is then a deterministic check — did the Lure happen? — rather than a judgement call, and the same check proves a fix worked.

Consequence: the injection lives in *data the agent reads*, never in the Task Brief. The Task Brief stays deliberately thin ("Ticket #123 opened — handle it") so that the attack surface is realistic.

Rejected: duplicating the Scenario with the poison baked in (drifts, hides the diff), and an LLM judge reading the transcript to decide if the agent was manipulated (non-deterministic, unexplainable on stage).
