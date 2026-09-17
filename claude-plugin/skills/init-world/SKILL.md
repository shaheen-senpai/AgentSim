---
name: init-world
description: Build an AgentSim World from this repo's own agent — its tools, database schema, third-party MCP integrations and Mandates, gathered from the codebase rather than pasted by hand.
---

# Building an AgentSim World from this agent

You are running inside an agent's own repository, connected to AgentSim's world-builder MCP server (`agentsim-worldbuilder`).

You build the **World** — what is true about this agent. You do **not** write the test: AgentSim generates the seed rows, the Scenarios and the Attacks on its own platform, under human review, because those are claims about what the agent *should* do and they belong where someone will read them.

## 1. Ask for a build token

The one thing to ask the user for. They open `/worlds/new` on their AgentSim console, choose "Generate it with the worldbuilder plugin", and copy the `wb_…` token it shows. `register_agent` refuses without a live one — that is what keeps a model call on their server behind their console.

## 2. Read the repo — do not ask the user for any of this

1. **The agent's tools.** Tool/function definitions (`@tool`, `betaZodTool`, an MCP server's own `tools/list` handler, a LangChain/OpenAI function-calling schema). Build a `{name, description, inputSchema}` entry for each.
2. **The schema.** DDL, migrations, an ORM's schema files (Prisma, Drizzle, SQLAlchemy models, Rails `schema.rb`). Read the raw text — do not summarise it.
3. **An OpenAPI spec**, if the repo has one.
4. **Third-party MCP servers this agent integrates.** `.mcp.json`, a client config, however its MCP servers are wired up. Pass each as `{name, url?, command?, tools?}` — AgentSim shadows the ones it has a catalog for (Stripe, Zendesk, Slack, Okta, Google Workspace) and models the rest from the tools you pass.
5. **The Mandates.** The rules this agent is actually held to: its system prompt, a POLICY/GUARDRAILS doc, a refusal list, the limits written into its own code. Pass each as `{title, text, source}`, with `text` quoted as written. Do not invent a rule the repo does not state, and do not soften one it does — these become the clauses every Check is later written against.
6. **The repo itself.** `git remote get-url origin` and `git rev-parse HEAD`, as `repo: {remote, commit, branch}`. It is how a second run is recognised as the same source instead of making a duplicate World.

## 3. Draft, review, create

1. Call `register_agent` with the token and everything you found. If its answer names an `existingWorlds` entry for this repo, say so: a draft one can be refined and re-created, a published one must be left alone — make a second World instead.
2. Call `get_world_draft` and show the user what was drafted: the entities and the ownership chain, the tools and their guards, the Mandates.
3. If they want changes, call `refine_world` with their plain-language note and show the result again. No second token is needed.
4. Once they approve it, call `create_world` with a world id (lowercase, hyphenated).

## 4. Hand off

The World is created as a **draft**. Tell the user, in these terms:

> Created as a draft at `/worlds/<id>`. Nothing can run against it until you review it there and publish it. On its Scenarios tab, "Generate Scenarios & seed data" writes the Task Brief, the Checks, the Attacks and the rows they need — review that, save it, then publish the World.

Do not write a Scenario, a seed row or an Attack yourself, and do not put them in a file for the user. The whole exchange should need no hand-written YAML: everything AgentSim needs about the agent comes from the repo you are already in.
