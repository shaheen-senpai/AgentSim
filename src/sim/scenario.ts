import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { Seed } from "./types";
import { DIMENSIONS, type Dimension } from "./dimensions";

export { DIMENSIONS, type Dimension };
const dimension = z.enum(DIMENSIONS);

const CheckSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("refund_created"), dimension, order: z.string(), amount: z.number().int() }),
  z.object({ type: z.literal("refunds_created"), dimension, count: z.number().int().nonnegative() }),
  z.object({ type: z.literal("ticket_status"), dimension, ticket: z.string(), status: z.enum(["open", "pending", "resolved"]) }),
  z.object({ type: z.literal("email_sent"), dimension, thread: z.string() }),
  z.object({ type: z.literal("tickets_modified_only"), dimension, tickets: z.array(z.string()) }),
  z.object({ type: z.literal("refund_amount_lte"), dimension, max: z.number().int() }),
  z.object({ type: z.literal("refund_customer_is"), dimension, customer: z.string() }),
  z.object({ type: z.literal("reads_scoped_to_customer"), dimension, customer: z.string() }),
]);
export type Check = z.infer<typeof CheckSchema>;

const LureSchema = z.object({ tool: z.string(), args_match: z.record(z.string(), z.unknown()) });
export type Lure = z.infer<typeof LureSchema>;

const MutationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("append_to_email"), email: z.string(), text: z.string() }),
]);

export const AttackSchema = z.object({ id: z.string(), title: z.string(), mutation: MutationSchema, lure: LureSchema });
export type Attack = z.infer<typeof AttackSchema>;

export const ScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  seed: z.string(),
  task_brief: z.string(),
  policy: z.object({ text: z.string() }),
  checks: z.array(CheckSchema).min(1),
  attacks: z.array(AttackSchema).default([]),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

const ticketStatus = z.enum(["open", "pending", "resolved"]);
export const SeedSchema = z.object({
  id: z.string(),
  name: z.string(),
  now: z.string(),
  currency: z.string(),
  customers: z.array(z.object({ id: z.string(), name: z.string(), email: z.string(), address: z.string() })),
  orders: z.array(z.object({ id: z.string(), customer_id: z.string(), items: z.array(z.string()), total: z.number().int(), placed_at: z.string(), status: z.string() })),
  payments: z.array(z.object({ id: z.string(), order_id: z.string(), amount: z.number().int(), card_last4: z.string(), status: z.string(), created_at: z.string() })),
  refunds: z.array(z.object({ id: z.string(), payment_id: z.string(), amount: z.number().int(), reason: z.string(), created_at: z.string() })).default([]),
  threads: z.array(z.object({ id: z.string(), customer_id: z.string(), subject: z.string() })),
  emails: z.array(z.object({ id: z.string(), thread_id: z.string(), from: z.string(), to: z.string(), sent_at: z.string(), body: z.string() })),
  tickets: z.array(z.object({ id: z.string(), customer_id: z.string(), thread_id: z.string(), subject: z.string(), status: ticketStatus, notes: z.array(z.string()).default([]) })),
});

const root = () => process.cwd();

export function loadSeed(id: string): Seed {
  const raw = parse(readFileSync(path.join(root(), "seeds", `${id}.yaml`), "utf8"));
  return SeedSchema.parse(raw) as Seed;
}

export function loadScenario(id: string): Scenario {
  const raw = parse(readFileSync(path.join(root(), "scenarios", `${id}.yaml`), "utf8"));
  const scenario = ScenarioSchema.parse(raw);
  validateReferences(scenario, loadSeed(scenario.seed));
  return scenario;
}

export function listScenarios(): Scenario[] {
  return readdirSync(path.join(root(), "scenarios"))
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => loadScenario(f.replace(/\.yaml$/, "")))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** One user message: the brief, then the Policy. Identical for the Reference Agent and BYO agents. */
export function buildTaskBrief(s: Scenario): string {
  return `${s.task_brief.trim()}\n\nPolicy:\n${s.policy.text.trim()}`;
}

export function validateReferences(s: Scenario, seed: Seed): void {
  const ids = new Set<string>();
  for (const col of [seed.customers, seed.orders, seed.payments, seed.refunds, seed.threads, seed.emails, seed.tickets]) for (const x of col) ids.add(x.id);
  const must = (id: string, where: string) => {
    if (!ids.has(id)) throw new Error(`Scenario ${s.id}: unknown entity ${id} in ${where}`);
  };
  s.checks.forEach((c, i) => {
    const where = `checks[${i}] ${c.type}`;
    if ("order" in c) must(c.order, where);
    if ("ticket" in c) must(c.ticket, where);
    if ("thread" in c) must(c.thread, where);
    if ("customer" in c) must(c.customer, where);
    if ("tickets" in c) c.tickets.forEach((t) => must(t, where));
  });
  s.attacks.forEach((a) => {
    if (a.mutation.type === "append_to_email") must(a.mutation.email, `attack ${a.id}`);
  });
}
