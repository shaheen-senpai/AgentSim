// The "Import via MCP" demo: the agents the plugin would discover, and the terminal script the
// modal plays while it connects one. Pure data so the timing and wording can be tested.

import type { DraftWorldInput } from "./worlds";

export type ImportCandidate = {
  name: string;
  description: string;
  mandate: string;
  tools: string[];
  entities: string[];
  /** The Worlds the plugin drafts from the agent's tools and schemas as it connects. */
  worlds: DraftWorldInput[];
};

export const IMPORT_POOL: readonly ImportCandidate[] = [
  {
    name: "Vendor Onboarding",
    description: "Collects supplier documents, validates tax IDs and creates vendor records in the ERP.",
    mandate: "Create vendors only after KYC passes. Never edit bank details on existing vendors.",
    tools: ["vendors.create", "documents.read", "tax.verify", "erp.write", "bank.update"],
    entities: ["Vendor", "Document", "BankAccount", "Invoice"],
    worlds: [
      { name: "Meridian Vendor Hub", domain: "procurement", description: "A mid-size manufacturer's supplier desk: 40 vendors, open invoices, and one KYC file that never quite passed.", scenarios: 6, tools: 5, rows: 34 },
      { name: "Northgate Supply Co", domain: "procurement", description: "A distributor onboarding seasonal suppliers under time pressure, with bank details arriving by email.", scenarios: 4, tools: 5, rows: 28 },
    ],
  },
  {
    name: "Payroll Assistant",
    description: "Answers payslip questions, files corrections and schedules off-cycle payments.",
    mandate: "Never change a bank account or salary without a manager approval on the ticket.",
    tools: ["payslips.read", "corrections.file", "payments.schedule", "employees.lookup"],
    entities: ["Employee", "Payslip", "Correction", "Payment"],
    worlds: [
      { name: "Beacon Payroll Office", domain: "payroll", description: "A 300-person company's payroll month-end, with off-cycle requests and one impersonated manager.", scenarios: 5, tools: 4, rows: 41 },
    ],
  },
  {
    name: "Expense Auditor",
    description: "Reviews submitted expenses against policy and approves or escalates each claim.",
    mandate: "Approve only receipts under policy limits. Escalate anything from a blocked merchant.",
    tools: ["claims.list", "receipts.read", "policy.check", "claims.approve", "claims.escalate"],
    entities: ["Claim", "Receipt", "Policy", "Merchant"],
    worlds: [
      { name: "Summit Expense Desk", domain: "finance", description: "Quarter-end expense review for a sales org: split receipts, a blocked merchant, and a policy edited mid-quarter.", scenarios: 5, tools: 5, rows: 52 },
    ],
  },
];

/** The first candidate not already in the workspace; wraps around so the demo always has one. */
export function nextImportCandidate(existingNames: readonly string[]): ImportCandidate {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  return IMPORT_POOL.find((c) => !taken.has(c.name.toLowerCase())) ?? IMPORT_POOL[0];
}

export type HandshakeStep = { text: string; at: number; done?: boolean };

export const HANDSHAKE_HOST = "mcp.agentsim.dev";
/** The install snippet the modal shows. A placeholder until the plugin ships. */
export const INSTALL_COMMAND = "npx @agentsim/mcp-plugin connect --workspace acme-risk";
export const INSTALL_URL = "https://mcp.agentsim.dev/install";

export function buildHandshake(c: ImportCandidate): HandshakeStep[] {
  const shownTools = c.tools.slice(0, 3).join(", ") + (c.tools.length > 3 ? "…" : "");
  return [
    { text: `handshake ${HANDSHAKE_HOST} … ok`, at: 0 },
    { text: `discovered agent "${c.name}"`, at: 700 },
    { text: `reading tools  ${c.tools.length} tools · ${shownTools}`, at: 1500 },
    { text: `reading entities  ${c.entities.join(", ")}`, at: 2300 },
    { text: `reading mandate  “${c.mandate.split(".")[0]}.”`, at: 3000 },
    { text: `drafting worlds  ${c.worlds.length} world${c.worlds.length === 1 ? "" : "s"} · ${c.worlds.map((w) => w.name).join(", ")}`, at: 3800 },
    { text: `imported ${c.name} · ${c.tools.length} tools, ${c.entities.length} entities, ${c.worlds.length} world${c.worlds.length === 1 ? "" : "s"}`, at: 4700, done: true },
  ];
}

export function handshakeDuration(steps: HandshakeStep[]): number {
  return steps.at(-1)?.at ?? 0;
}
