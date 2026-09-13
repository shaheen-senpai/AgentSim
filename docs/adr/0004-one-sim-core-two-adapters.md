# One sim core, two adapters

The simulated Systems' tool handlers are written once, in a framework-free `sim` module, and every call passes through `world.execute(tool, args)`, which mutates the World and appends the Event. Two thin adapters sit on top: the Anthropic SDK Tool Runner (in-process, drives the Reference Agent) and an MCP server over Streamable HTTP at `/mcp` (for any external agent). Both therefore produce identical Events and are evaluated identically.

Everything ships as a single Next.js application — UI, API route handlers, Runner, Evaluator and MCP endpoint — because two people in under 48 hours cannot afford a second process to build, run and demo.

Rejected: a separate MCP server process (more moving parts on stage), and calling our own MCP server through the API's MCP connector (Anthropic's servers would need to reach a laptop).
