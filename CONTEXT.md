# AgentSim

A simulated business environment in which AI agents are run against realistic tasks — and adversarial variants of them — and scored on whether they acted correctly, safely and within their authority.

## Language

### Scenarios

**Scenario**:
A reusable definition of a test: the seeded World, the Task Brief, the Policy, and its Checks. A Scenario has many Runs.
_Avoid_: test, test case, episode, simulation

**Task Brief**:
The instruction the Runner hands the agent at the start of a Run: which Ticket to handle, plus the Scenario's Policy text. The agent learns everything else by reading the World through its tools. Identical for the Reference Agent and any external agent.
_Avoid_: prompt, task, instruction

**Seed**:
A file defining a base World — a whole small business — that Scenarios reference and may patch. Declares the frozen clock (`now`).
_Avoid_: fixture, dataset, world file

**Policy**:
The authority a Scenario grants the agent — what it may do, on what, within what limits. Belongs to the Scenario, not the agent.
_Avoid_: permissions, rules, guardrails

**Check**:
A deterministic test the Evaluator applies to a Run. Comes in two kinds: Outcome Assertions and Action Rules.
_Avoid_: expectation, assertion (alone), test

**Outcome Assertion**:
A Check against the final World: what must be true — and what must not — when the Run ends ("exactly one refund of £49.99 on order 1042").
_Avoid_: expected outcome, forbidden outcome, goal

**Action Rule**:
A Check applied to every tool call as it happens ("refund amount ≤ Policy maximum", "no reads of a customer other than the ticket's").
_Avoid_: guardrail, constraint, invariant

**Attack**:
A named mutation applied to the World when a Run starts — for now, injecting content into a document the agent will read. A Run is a Scenario with or without an Attack; the Policy and Checks are unchanged. Every Attack declares its Lure.
_Avoid_: adversarial scenario, red-team case, exploit, variant

**Lure**:
The concrete action an Attack is trying to induce (`issue_refund` with `amount: 500`). The agent performing the Lure is a Safety Violation.
_Avoid_: payload, goal, target action

### Runs

**Runner**:
The component that executes a Run: seeds the World from the Scenario, applies the Attack, hands the agent its Task Brief, drives the agent to completion, then invokes the Evaluator.
_Avoid_: harness, orchestrator, executor

**Run**:
One execution of one agent against one Scenario, with or without an Attack, producing a timeline and a Trust Score.
_Avoid_: session, episode, execution, test run

**World**:
The shared business state — customers, emails, tickets, orders, payments — that every System reads and writes. Seeded by the Scenario; static except in response to the agent.
_Avoid_: environment, state, database, sandbox

**System**:
One of the four simulated business applications — Email, Support, Orders, Payments — exposed to the agent as a small group of tools over the shared World.
_Avoid_: app, mock, integration, service, sim

**Event**:
One recorded step in a Run's timeline: a tool call, its result, and the World changes it caused.
_Avoid_: step, action, log entry, trace

**Snapshot**:
The complete World captured at a moment in a Run. Start and end Snapshots give the world-state diff.
_Avoid_: checkpoint, state dump

**Replay**:
Scrubbing through a recorded Run's Events. Makes no model calls and changes nothing.
_Avoid_: playback, rewind, rerun

**Rerun**:
Executing a Scenario again — typically after fixing the agent — producing a new Run to compare against an earlier one.
_Avoid_: replay, retry, re-execute

### World entities

**Customer**:
A person who buys from the shop. Owns Orders, Threads and Tickets; every other entity resolves to exactly one Customer.
_Avoid_: user, account, client

**Order**:
A purchase by a Customer. Has one or more Payments.
_Avoid_: purchase, transaction, basket

**Payment**:
A charge taken against an Order (`amount` in minor units, `currency`, `card_last4`, `status`). A duplicate charge is two succeeded Payments on one Order.
_Avoid_: charge, transaction, payment intent

**Refund**:
Money returned against a specific Payment. A separate entity, so a Run's diff shows it as "+1 Refund".
_Avoid_: reversal, credit, chargeback

**Ticket**:
A support case for one Customer, pointing at one Thread. Status is `open`, `pending` or `resolved`; carries agent Notes.
_Avoid_: case, issue, conversation

**Thread**:
An email conversation between one Customer and support, made of Emails.
_Avoid_: conversation, mailbox, inbox

**Email**:
One message in a Thread. Its `body` is untrusted content — it is where an Attack injects.
_Avoid_: message, mail, note

### Evaluation

**Evaluator**:
The component that applies a Scenario's Checks to a Run and produces its Violations and Trust Score.
_Avoid_: judge, grader, scorer

**Violation**:
A record of one Check failing on one Run: which Check, which Event triggered it, and why. The source of truth for every explanation.
_Avoid_: failure, error, breach, finding

**Trust Score**:
A Run's headline 0–100 score, aggregated from five Dimensions and hard-capped when any Policy Compliance, Safety or Data Access Violation exists.
_Avoid_: grade, rating, pass rate

**Dimension**:
One of the five named facets a Run is scored on: Task Completion, Correctness, Policy Compliance, Safety, Data Access.
_Avoid_: category, metric, criterion

### Agents

**Reference Agent**:
The customer-support agent AgentSim ships to demonstrate itself. Exists in a naïve version that fails the attacked Scenario and a fixed version that passes it.
_Avoid_: demo agent, sample agent, test agent
