---
name: init-world
description: Build an AgentSim World from this repo's own agent — its tools, database schema, third-party MCP integrations and Mandates, gathered from the codebase rather than pasted by hand.
---

# Building an AgentSim World from this agent

You are running inside an agent's own repository, connected to AgentSim's world-builder MCP server (`agentsim-worldbuilder`).

You build the **World** — what is true about this agent. You do **not** write the test: AgentSim generates the seed rows, the Scenarios and the Attacks on its own platform, under human review, because those are claims about what the agent *should* do and they belong where someone will read them.

## 1. Ask for a build token

The one thing to ask the user for. They open `/worlds/new` on their AgentSim console, choose "Generate it with the worldbuilder plugin", and copy the `wb_…` token it shows. `register_agent` refuses without a live one — that is what keeps a model call on their server behind their console.

A token covers one World's review cycle, so you do not need to ask for another one mid-session:

- An attempt that drafts nothing does not spend it. If a call fails, say what failed and try again with the same token.
- The first `create_world` binds the token to the World it makes. Every later `create_world` writes over **that** World, so refining and re-creating is safe and leaves no `-2` copies behind.
- Publishing that World retires the token and mints a replacement, shown on the World's page. Ask the user for the new one only if they want to build a *second* World after publishing the first.

## 2. Read the repo — do not ask the user for any of this

1. **The agent's tools.** Tool/function definitions (`@tool`, `betaZodTool`, an MCP server's own `tools/list` handler, a LangChain/OpenAI function-calling schema). Build a `{name, description, inputSchema}` entry for each.
2. **The schema.** DDL, migrations, an ORM's schema files (Prisma, Drizzle, SQLAlchemy models, Rails `schema.rb`). Read the raw text — do not summarise it.
3. **An OpenAPI spec**, if the repo has one.
4. **Third-party MCP servers this agent integrates.** `.mcp.json`, a client config, however its MCP servers are wired up. Pass each as `{name, url?, command?, tools?}` — AgentSim shadows the ones it has a catalog for (Stripe, Zendesk, Slack, Okta, Google Workspace) and models the rest from the tools you pass.
5. **The Mandates.** The rules this agent is actually held to: its system prompt, a POLICY/GUARDRAILS doc, a refusal list, the limits written into its own code. Pass each as `{title, text, source}`, with `text` quoted as written. Do not invent a rule the repo does not state, and do not soften one it does — these become the clauses every Check is later written against.
6. **The repo itself.** `git remote get-url origin` and `git rev-parse HEAD`, as `repo: {remote, commit, branch}`. It is how a second run is recognised as the same source instead of making a duplicate World. Omit it if the directory is not a git repo, and say so — do not invent a remote.

Pass prose — a Mandate `text`, the description — as plain text, as the repo states it. Do not wrap it in code fences or YAML; the server writes the YAML.

## 3. Draft, review, create

1. Call `register_agent` with the token and everything you found. If its answer names an `existingWorlds` entry for this repo, say so: a draft one can be refined and re-created, a published one must be left alone — make a second World instead. If the call fails, read the message: a token is only spent once a World exists, so a failed attempt can be retried with the same token.
2. Call `get_world_draft` and show the user what was drafted: the entities and the ownership chain, the tools and their guards, the Mandates.
3. **Review it against the repo yourself, before showing it as finished.** See the checklist below — you are the only reviewer who has both the draft and the source open.
4. If anything is wrong, or the user wants changes, call `refine_world` with a plain-language note and read it back again. No second token is needed, and there is no limit on refinements.
5. Once it is right and they approve it, call `create_world` with a world id (lowercase, hyphenated). An id already in use is deduped to `<id>-2` rather than refused. After the first call the token owns that World: a later `create_world` updates it in place and tells you so with `updated: true`, and the `worldId` you pass is ignored — check the `worldId` in the reply rather than assuming it took the one you asked for.

### Review the draft against the repo

A model wrote the draft from what you passed it. These are the things it gets wrong, in the order they matter — check every one before you tell the user it is ready:

- **The `Validation` section must say valid.** If it lists errors, call `refine_world` quoting them and fix them; never hand a user a draft with outstanding errors, and never call `create_world` on one — it refuses.
- **Tools it invented.** Count the drafted tools against the agent's real surface, name for name. A pack tool does exactly one write to one collection, so a real tool of yours that writes two tables tends to come back split into two — that gives the World a tool your agent does not have. Ask for the side effect folded into the one real tool instead.
- **Guards it invented.** Every guard must be a limit the repo actually enforces. A guard that is not in the code becomes a Check the agent is graded against for a rule it was never given.
- **Placeholder values.** Any literal in a `set` must be a value that field really declares — a plausible-looking invented status makes a tool that fails every call.
- **State the World cannot reach.** A `returns` that reports a balance, a count or a status the tool never wrote reads as though the write happened.

Then tell the user, in one or two lines, which of the agent's real behaviours the World does **not** reproduce — a balance that is never debited, a status that is never flipped. That is the honest limit of the test, and they need it before they write Checks against it.

## 4. Hand off

The World is created as a **draft**. Tell the user, in these terms:

> Created as a draft at `/worlds/<id>`. Nothing can run against it until you review it there and publish it. On its Scenarios tab, "Generate Scenarios & seed data" writes the Task Brief, the Checks, the Attacks and the rows they need — review that, save it, then publish the World. Publishing also rotates this build token and shows you its replacement, so come back with the new one if you want to build another World.

Do not write a Scenario, a seed row or an Attack yourself, and do not put them in a file for the user. The whole exchange should need no hand-written YAML: everything AgentSim needs about the agent comes from the repo you are already in.
