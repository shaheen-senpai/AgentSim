---
name: init-world
description: Build an AgentSim World from this repo's own agent — its tools, database schema, third-party MCP integrations and Mandates, gathered from the codebase rather than pasted by hand.
---

# Building an AgentSim World from this agent

You are running inside an agent's own repository, connected to AgentSim's world-builder MCP server (`agentsim-worldbuilder`).

**You write the World.** You are the only party with this repo open, so AgentSim does not guess at it from a summary you paste: you read the format, write the pack files against the code, validate them there and create the World. Nothing you do here spends a model call on AgentSim's side, so iterate until it is right.

You build the **World** — what is true about this agent. You do **not** write the test: AgentSim generates the seed rows, the Scenarios and the Attacks on its own platform, under human review, because those are claims about what the agent *should* do and they belong where someone will read them.

## 1. Ask for a build token

The one thing to ask the user for. They open `/worlds/new` on their AgentSim console, choose the worldbuilder plugin, and copy the `wb_…` token it shows. `create_world` refuses without a live one — that is what keeps writing a World behind their console rather than just the URL.

A token covers one World's review cycle, so you do not need to ask for another one mid-session:

- The first `create_world` binds the token to the World it makes. Every later `create_world` writes over **that** World, so fixing and re-creating is safe and leaves no `-2` copies behind.
- Publishing that World retires the token and mints a replacement, shown on the World's page. Ask the user for the new one only if they want to build a *second* World after publishing the first.

## 2. Read the repo — do not ask the user for any of this

1. **The agent's tools.** Tool/function definitions (`@tool`, `betaZodTool`, an MCP server's own `tools/list` handler, a LangChain/OpenAI function-calling schema).
2. **The schema.** DDL, migrations, an ORM's schema files (Prisma, Drizzle, SQLAlchemy models, Rails `schema.rb`). Read the raw text — do not work from a summary of it.
3. **An OpenAPI spec**, if the repo has one.
4. **Third-party MCP servers this agent integrates.** `.mcp.json`, a client config, however its MCP servers are wired up.
5. **The Mandates.** The rules this agent is actually held to: its system prompt, a POLICY/GUARDRAILS doc, a refusal list, the limits written into its own code. Quote them as written. Do not invent a rule the repo does not state, and do not soften one it does — these become the clauses every Check is later written against.
6. **The repo itself.** `git remote get-url origin` and `git rev-parse HEAD`, to pass as `repo: {remote, commit, branch}`. It is how a second run is recognised as the same source instead of making a duplicate World. Omit it if the directory is not a git repo, and say so — do not invent a remote.

## 3. Write, validate, create

1. Call `get_world_format`, with `repo` if you have one. It returns the World pack DSL reference and tells you whether this repo already built a World — a draft one is updated by the token that built it, a published one must be left alone, so build a second World instead.
2. **Write the three files yourself**, against what you read in step 2:
   - `pack.yaml` — systems, entities, the ownership chain between them, and the Mandates.
   - `tools.yaml` — one entry per tool the agent really has.
   - `seed.yaml` — `now`, `currency`, and an empty array for every entity. No rows.
   Write no `scenarios/` file and no `agents/` file.
3. Call `validate_world_files` and fix what it reports. It is the same validator `create_world` runs and it costs nothing, so call it as often as you like — never hand the user files you have not validated.
4. Once it is valid and they approve it, call `create_world` with the token, a world id (lowercase, hyphenated) and the files. An id already in use is deduped to `<id>-2` rather than refused, and after the first call the token owns that World: a later `create_world` updates it in place and says so with `updated: true`. Check the `worldId` in the reply rather than assuming it took the one you asked for.

### Check your own work before you call it done

You wrote the World from the repo, so these are yours to get right:

- **Tools you invented.** Count the pack's tools against the agent's real surface, name for name. A pack tool does exactly one write to one collection, so a real tool that writes two tables is tempting to split in two — don't: that gives the World a tool your agent does not have. Fold the side effect into the one real tool.
- **Guards you invented.** Every guard must be a limit the repo actually enforces. A guard that is not in the code becomes a Check the agent is graded against for a rule it was never given.
- **Placeholder values.** Any literal in a `set` must be a value that field really declares — a plausible-looking invented status makes a tool that fails every call.
- **State the World cannot reach.** A `returns` that reports a balance, a count or a status the tool never wrote reads as though the write happened.

Then tell the user, in one or two lines, which of the agent's real behaviours the World does **not** reproduce — a balance that is never debited, a status that is never flipped. That is the honest limit of the test, and they need it before they write Checks against it.

## 4. Hand off

The World is created as a **draft**. Tell the user, in these terms:

> Created as a draft at `/worlds/<id>`. Nothing can run against it until you review it there and publish it. On its Scenarios tab, "Generate Scenarios & seed data" writes the Task Brief, the Checks, the Attacks and the rows they need — review that, save it, then publish the World. Publishing also rotates this build token and shows you its replacement, so come back with the new one if you want to build another World.

Do not write a Scenario, a seed row or an Attack yourself, and do not put them in a file for the user.
