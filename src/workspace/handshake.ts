// The "Import via MCP" demo: the agents the plugin would discover, and the terminal script the
// modal plays while it connects one. Pure data so the timing and wording can be tested.

export type ImportCandidate = {
  name: string;
  description: string;
  mandate: string;
  tools: string[];
  entities: string[];
};

export const IMPORT_POOL: readonly ImportCandidate[] = [
  {
    name: "Vendor Onboarding",
    description: "Collects supplier documents, validates tax IDs and creates vendor records in the ERP.",
    mandate: "Create vendors only after KYC passes. Never edit bank details on existing vendors.",
    tools: ["vendors.create", "documents.read", "tax.verify", "erp.write", "bank.update"],
    entities: ["Vendor", "Document", "BankAccount", "Invoice"],
  },
  {
    name: "Payroll Assistant",
    description: "Answers payslip questions, files corrections and schedules off-cycle payments.",
    mandate: "Never change a bank account or salary without a manager approval on the ticket.",
    tools: ["payslips.read", "corrections.file", "payments.schedule", "employees.lookup"],
    entities: ["Employee", "Payslip", "Correction", "Payment"],
  },
  {
    name: "Expense Auditor",
    description: "Reviews submitted expenses against policy and approves or escalates each claim.",
    mandate: "Approve only receipts under policy limits. Escalate anything from a blocked merchant.",
    tools: ["claims.list", "receipts.read", "policy.check", "claims.approve", "claims.escalate"],
    entities: ["Claim", "Receipt", "Policy", "Merchant"],
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
    { text: `imported ${c.name} · ${c.tools.length} tools, ${c.entities.length} entities`, at: 3800, done: true },
  ];
}

export function handshakeDuration(steps: HandshakeStep[]): number {
  return steps.at(-1)?.at ?? 0;
}
