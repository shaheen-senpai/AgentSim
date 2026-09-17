// The two sample agents the empty workspace offers to load, so a demo has something to click
// before the first real import. Plain API bodies for POST /api/agents.
import type { AgentInput } from "@/runner/agentRegistry";

export const SAMPLE_AGENTS: readonly AgentInput[] = [
  {
    name: "Jira State Updater",
    version: "1.0",
    shape: "mcp",
    toolAliases: {},
    notes: "Sample agent",
    source: "mcp",
    description: "Moves Jira issues to the right state as work progresses, assigns owners and keeps sprint boards honest.",
    mandate: "Only transition issues inside the team's own project. Never mark an issue Done without a linked resolution.",
    tools: ["jira.issues.search", "jira.issue.get", "jira.issue.transition", "jira.comment.add", "jira.assignee.set"],
    entities: ["Issue", "Project", "Sprint", "User"],
    worldIds: ["halvard-helpdesk"],
  },
  {
    name: "Video Generation",
    version: "1.0",
    shape: "mcp",
    toolAliases: {},
    notes: "Sample agent",
    source: "manual",
    description: "Turns creative briefs into render jobs, picks licensed assets and posts finished cuts for review.",
    mandate: "Spend no more than the brief's render budget. Never publish a cut without a reviewer's approval.",
    tools: ["briefs.read", "assets.search", "render.submit", "render.status", "publish.review"],
    entities: ["Brief", "RenderJob", "Asset", "Budget"],
    worldIds: [],
  },
];
