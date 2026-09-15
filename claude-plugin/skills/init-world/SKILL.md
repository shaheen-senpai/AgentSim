---
name: init-world
description: Draft and create an AgentSim World pack from this repo's own agent — its tools, schema and OpenAPI, gathered from the codebase rather than pasted by hand.
---

# Building an AgentSim World from this agent

You are running inside an agent's own repository, connected to AgentSim's world-builder MCP server (`agentsim-worldbuilder`). Do not ask the user to paste their tool list, schema, or OpenAPI spec — read them from the repo:

1. **Find the agent's tools.** Look for tool/function definitions (`@tool`, `betaZodTool`, an MCP server's own `tools/list` handler, a LangChain/OpenAI function-calling schema, or similar) and build a `{name, description, inputSchema}` entry for each.
2. **Find the schema.** Look for DDL, migrations, an ORM's schema files (Prisma, Drizzle, SQLAlchemy models, Rails `schema.rb`), or similar. Read the raw text — do not summarize it.
3. **Find an OpenAPI spec**, if the repo has one.
4. Call `register_agent` on `agentsim-worldbuilder` with everything you found, plus a short description of what the agent does.
5. Call `get_world_draft` and show the user what was drafted.
6. If they want changes, call `refine_world` with their plain-language note and show the result again.
7. Once they approve it, call `create_world` with a world id (lowercase, hyphenated) to persist it.

The whole exchange should need no manually written YAML — everything AgentSim needs comes from the repo you are already in.
