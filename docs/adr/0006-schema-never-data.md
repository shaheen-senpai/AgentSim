# Schema, never data

To simulate a customer's domain we need to know its shape. The obvious way to get it is a copy of their data. We will not take one.

We import **structure only** — a SQL schema, an OpenAPI document, a list of tool definitions — and **generate** the rows ourselves: a small, coherent Seed with real relationships, believable names and deliberate distractors (other principals with records of their own, so a Data Access Check can actually fire). Recorded traffic, where a team offers it, is stripped to shapes before it is read. No production row ever enters a World pack.

Consequence: onboarding needs nothing a team would have to get legal approval for, and a World pack is small enough to read, commit and review as YAML — which is what makes "confirm the Ownership map" a five-minute human step rather than a data-governance project. The cost is that generated data is only as good as the generator, and a Seed that is too tidy makes a Scenario too easy; the human review step exists for that, and the pack format's checklist asks for distractors by name. This is the ADR this build implements most fully: `POST /api/worlds/generate` takes a schema or a tool list and drafts a pack for review, and never writes one without an explicit human action.

Rejected: masked or anonymised production snapshots. They are still PII-adjacent, they carry the compliance burden we are trying to avoid, and they are large where small is better — a Run that reads ten thousand customers is slower to seed, slower to diff and no more revealing than one that reads five.
