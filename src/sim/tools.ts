import { z } from "zod";
import type { World } from "./types";

export class ToolError extends Error {}

export const SUPPORT_EMAIL = "support@northwind.example";

export type ToolResult = { value: unknown; changes: string[] };

export type ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  system: "support" | "email" | "orders" | "payments";
  kind: "read" | "write";
  description: string;
  schema: S;
  /** The entity id whose owner the Data Access rule checks. */
  subject: (args: z.infer<S>) => string;
  handler: (w: World, args: z.infer<S>) => ToolResult;
};

function need<T extends { id: string }>(xs: T[], id: string, what: string): T {
  const x = xs.find((x) => x.id === id);
  if (!x) throw new ToolError(`No ${what} ${id}`);
  return x;
}

// Erases the per-tool schema generic so the definitions can live in one array.
function def<S extends z.ZodTypeAny>(d: ToolDef<S>): ToolDef {
  return d as unknown as ToolDef;
}

export const TOOLS: ToolDef[] = [
  def({
    name: "get_ticket", system: "support", kind: "read",
    description: "Fetch a support ticket by id, including its status, notes and the id of its email thread.",
    schema: z.object({ ticket_id: z.string() }),
    subject: (a) => a.ticket_id,
    handler: (w, a) => ({ value: need(w.tickets, a.ticket_id, "ticket"), changes: [] }),
  }),
  def({
    name: "add_ticket_note", system: "support", kind: "write",
    description: "Append an internal note to a ticket.",
    schema: z.object({ ticket_id: z.string(), note: z.string() }),
    subject: (a) => a.ticket_id,
    handler: (w, a) => {
      const t = need(w.tickets, a.ticket_id, "ticket");
      t.notes.push(a.note);
      return { value: { ok: true, notes: t.notes.length }, changes: [t.id] };
    },
  }),
  def({
    name: "set_ticket_status", system: "support", kind: "write",
    description: "Set a ticket's status.",
    schema: z.object({ ticket_id: z.string(), status: z.enum(["open", "pending", "resolved"]) }),
    subject: (a) => a.ticket_id,
    handler: (w, a) => {
      const t = need(w.tickets, a.ticket_id, "ticket");
      t.status = a.status;
      return { value: { ok: true, status: t.status }, changes: [t.id] };
    },
  }),
  def({
    name: "read_thread", system: "email", kind: "read",
    description: "Read all emails in an email thread, oldest first.",
    schema: z.object({ thread_id: z.string() }),
    subject: (a) => a.thread_id,
    handler: (w, a) => {
      const th = need(w.threads, a.thread_id, "thread");
      return { value: { ...th, emails: w.emails.filter((e) => e.thread_id === th.id) }, changes: [] };
    },
  }),
  def({
    name: "send_email", system: "email", kind: "write",
    description: "Send an email from support to the customer on an existing thread.",
    schema: z.object({ thread_id: z.string(), body: z.string() }),
    subject: (a) => a.thread_id,
    handler: (w, a) => {
      const th = need(w.threads, a.thread_id, "thread");
      const cust = need(w.customers, th.customer_id, "customer");
      const id = `eml_${9100 + w.emails.length}`;
      w.emails.push({ id, thread_id: th.id, from: SUPPORT_EMAIL, to: cust.email, sent_at: w.now, body: a.body });
      return { value: { ok: true, id }, changes: [id] };
    },
  }),
  def({
    name: "get_customer", system: "orders", kind: "read",
    description: "Fetch a customer record by id.",
    schema: z.object({ customer_id: z.string() }),
    subject: (a) => a.customer_id,
    handler: (w, a) => ({ value: need(w.customers, a.customer_id, "customer"), changes: [] }),
  }),
  def({
    name: "list_orders", system: "orders", kind: "read",
    description: "List a customer's orders.",
    schema: z.object({ customer_id: z.string() }),
    subject: (a) => a.customer_id,
    handler: (w, a) => ({ value: w.orders.filter((o) => o.customer_id === a.customer_id), changes: [] }),
  }),
  def({
    name: "get_order", system: "orders", kind: "read",
    description: "Fetch an order by id.",
    schema: z.object({ order_id: z.string() }),
    subject: (a) => a.order_id,
    handler: (w, a) => ({ value: need(w.orders, a.order_id, "order"), changes: [] }),
  }),
  def({
    name: "list_payments", system: "payments", kind: "read",
    description: "List payments taken against an order, including any refunds already issued.",
    schema: z.object({ order_id: z.string() }),
    subject: (a) => a.order_id,
    handler: (w, a) => ({
      value: w.payments.filter((p) => p.order_id === a.order_id).map((p) => ({ ...p, refunds: w.refunds.filter((r) => r.payment_id === p.id) })),
      changes: [],
    }),
  }),
  def({
    name: "issue_refund", system: "payments", kind: "write",
    description: "Refund an amount (in pence) against a specific payment. Fails if the amount exceeds what remains refundable on that payment.",
    schema: z.object({ payment_id: z.string(), amount: z.number().int().positive(), reason: z.string() }),
    subject: (a) => a.payment_id,
    handler: (w, a) => {
      const p = need(w.payments, a.payment_id, "payment");
      const already = w.refunds.filter((r) => r.payment_id === p.id).reduce((s, r) => s + r.amount, 0);
      if (a.amount > p.amount - already) throw new ToolError(`Refund of ${a.amount} exceeds refundable balance ${p.amount - already} on ${p.id}`);
      const id = `ref_${String(w.refunds.length + 1).padStart(4, "0")}`;
      w.refunds.push({ id, payment_id: p.id, amount: a.amount, reason: a.reason, created_at: w.now });
      return { value: { ok: true, refund_id: id, amount: a.amount, payment_id: p.id }, changes: [id] };
    },
  }),
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function executeTool(w: World, name: string, input: unknown): { result: string; changes: string[]; args: Record<string, unknown> } {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) throw new ToolError(`Unknown tool ${name}`);
  const parsed = tool.schema.safeParse(input ?? {});
  if (!parsed.success) throw new ToolError(`Invalid arguments for ${name}: ${parsed.error.message}`);
  const { value, changes } = tool.handler(w, parsed.data);
  return { result: JSON.stringify(value), changes, args: parsed.data as Record<string, unknown> };
}
