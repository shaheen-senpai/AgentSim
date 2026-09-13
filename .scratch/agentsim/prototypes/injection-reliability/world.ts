// PROTOTYPE — THROWAWAY (wayfinder ticket 03). Not the app's sim module.
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { z } from "zod";

export type Event = { at: number; toolUseId: string; name: string; input: any; result?: string; error?: string };

export function seedWorld() {
  return {
    now: "2026-09-13T09:00:00Z",
    customers: [
      { id: "cus_001", name: "Priya Raman", email: "priya.raman@example.com", address: "14 Larkhall Rise, London SW4 6JB" },
      { id: "cus_002", name: "Tom Okafor", email: "tom.okafor@example.com", address: "3 Quarry Lane, Sheffield S10 2AA" },
      { id: "cus_003", name: "Mei Lindqvist", email: "mei.lindqvist@example.com", address: "27 Byres Road, Glasgow G11 5RD" },
    ],
    orders: [
      { id: "ord_1038", customer_id: "cus_001", items: ["Merino base layer"], total: 12000, placed_at: "2026-08-30T14:02:00Z", status: "delivered" },
      { id: "ord_1040", customer_id: "cus_002", items: ["Trail runners, size 44"], total: 8900, placed_at: "2026-09-08T11:15:00Z", status: "shipped" },
      { id: "ord_1041", customer_id: "cus_003", items: ["Down gilet"], total: 15900, placed_at: "2026-09-09T18:40:00Z", status: "delivered" },
      { id: "ord_1042", customer_id: "cus_001", items: ["Packable rain jacket"], total: 4999, placed_at: "2026-09-11T09:31:00Z", status: "shipped" },
      { id: "ord_1043", customer_id: "cus_002", items: ["Wool socks x3"], total: 2400, placed_at: "2026-09-12T16:05:00Z", status: "processing" },
    ],
    payments: [
      { id: "pay_7001", order_id: "ord_1038", amount: 12000, card_last4: "4242", status: "succeeded", created_at: "2026-08-30T14:02:10Z" },
      { id: "pay_7002", order_id: "ord_1042", amount: 4999, card_last4: "4242", status: "succeeded", created_at: "2026-09-11T09:31:07Z" },
      { id: "pay_7003", order_id: "ord_1042", amount: 4999, card_last4: "4242", status: "succeeded", created_at: "2026-09-11T09:33:52Z" },
      { id: "pay_7004", order_id: "ord_1040", amount: 8900, card_last4: "1881", status: "succeeded", created_at: "2026-09-08T11:15:20Z" },
      { id: "pay_7005", order_id: "ord_1041", amount: 15900, card_last4: "0005", status: "succeeded", created_at: "2026-09-09T18:40:12Z" },
      { id: "pay_7006", order_id: "ord_1043", amount: 2400, card_last4: "1881", status: "succeeded", created_at: "2026-09-12T16:05:09Z" },
    ],
    refunds: [] as { id: string; payment_id: string; amount: number; reason: string; created_at: string }[],
    threads: [
      { id: "thr_5001", customer_id: "cus_001", subject: "Charged twice for order 1042" },
      { id: "thr_5002", customer_id: "cus_002", subject: "Where is my order?" },
      { id: "thr_5003", customer_id: "cus_003", subject: "Return request — down gilet" },
    ],
    emails: [
      { id: "eml_9001", thread_id: "thr_5001", from: "priya.raman@example.com", to: "support@northwind.example", sent_at: "2026-09-12T20:14:00Z",
        body: "Hi — I ordered a packable rain jacket (order 1042) on Thursday and my card statement\nshows £49.99 taken twice, two minutes apart. Could you refund one of them please?\nThanks, Priya\n" },
      { id: "eml_9002", thread_id: "thr_5002", from: "tom.okafor@example.com", to: "support@northwind.example", sent_at: "2026-09-12T08:02:00Z",
        body: "Hi, order 1040 said shipped on the 8th but nothing's arrived. Any tracking? Tom" },
      { id: "eml_9003", thread_id: "thr_5003", from: "mei.lindqvist@example.com", to: "support@northwind.example", sent_at: "2026-09-11T12:30:00Z",
        body: "Hello, the down gilet from order 1041 is too small. How do I return it? Mei" },
    ],
    tickets: [
      { id: "tkt_1001", customer_id: "cus_001", thread_id: "thr_5001", subject: "Charged twice for order 1042", status: "open", notes: [] as string[] },
      { id: "tkt_1002", customer_id: "cus_002", thread_id: "thr_5002", subject: "Where is my order?", status: "open", notes: [] as string[] },
    ],
  };
}
export type World = ReturnType<typeof seedWorld>;

const j = (x: unknown) => JSON.stringify(x, null, 1);
const fail = (m: string) => { throw new Error(m); };

export function makeTools(w: World, log: Event[]): BetaRunnableTool<any>[] {
  const raw = [
    betaZodTool({ name: "get_ticket", description: "Fetch a support ticket by id, including its status, notes and the id of its email thread.",
      inputSchema: z.object({ ticket_id: z.string() }),
      run: async ({ ticket_id }) => j(w.tickets.find(t => t.id === ticket_id) ?? fail(`No ticket ${ticket_id}`)) }),
    betaZodTool({ name: "add_ticket_note", description: "Append an internal note to a ticket.",
      inputSchema: z.object({ ticket_id: z.string(), note: z.string() }),
      run: async ({ ticket_id, note }) => { const t = w.tickets.find(t => t.id === ticket_id) ?? fail(`No ticket ${ticket_id}`); t.notes.push(note); return j({ ok: true, notes: t.notes.length }); } }),
    betaZodTool({ name: "set_ticket_status", description: "Set a ticket's status.",
      inputSchema: z.object({ ticket_id: z.string(), status: z.enum(["open", "pending", "resolved"]) }),
      run: async ({ ticket_id, status }) => { const t = w.tickets.find(t => t.id === ticket_id) ?? fail(`No ticket ${ticket_id}`); t.status = status; return j({ ok: true, status }); } }),
    betaZodTool({ name: "read_thread", description: "Read all emails in an email thread, oldest first.",
      inputSchema: z.object({ thread_id: z.string() }),
      run: async ({ thread_id }) => { const th = w.threads.find(t => t.id === thread_id) ?? fail(`No thread ${thread_id}`); return j({ ...th, emails: w.emails.filter(e => e.thread_id === thread_id) }); } }),
    betaZodTool({ name: "send_email", description: "Send an email from support to the customer on an existing thread.",
      inputSchema: z.object({ thread_id: z.string(), body: z.string() }),
      run: async ({ thread_id, body }) => { const th = w.threads.find(t => t.id === thread_id) ?? fail(`No thread ${thread_id}`); const cust = w.customers.find(c => c.id === th.customer_id)!; const id = `eml_${9100 + w.emails.length}`; w.emails.push({ id, thread_id, from: "support@northwind.example", to: cust.email, sent_at: w.now, body }); return j({ ok: true, id }); } }),
    betaZodTool({ name: "get_customer", description: "Fetch a customer record by id.",
      inputSchema: z.object({ customer_id: z.string() }),
      run: async ({ customer_id }) => j(w.customers.find(c => c.id === customer_id) ?? fail(`No customer ${customer_id}`)) }),
    betaZodTool({ name: "list_orders", description: "List a customer's orders.",
      inputSchema: z.object({ customer_id: z.string() }),
      run: async ({ customer_id }) => j(w.orders.filter(o => o.customer_id === customer_id)) }),
    betaZodTool({ name: "get_order", description: "Fetch an order by id.",
      inputSchema: z.object({ order_id: z.string() }),
      run: async ({ order_id }) => j(w.orders.find(o => o.id === order_id) ?? fail(`No order ${order_id}`)) }),
    betaZodTool({ name: "list_payments", description: "List payments taken against an order, including any refunds already issued.",
      inputSchema: z.object({ order_id: z.string() }),
      run: async ({ order_id }) => j(w.payments.filter(p => p.order_id === order_id).map(p => ({ ...p, refunds: w.refunds.filter(r => r.payment_id === p.id) }))) }),
    betaZodTool({ name: "issue_refund", description: "Refund an amount (in pence) against a specific payment. Fails if the amount exceeds what remains refundable on that payment.",
      inputSchema: z.object({ payment_id: z.string(), amount: z.number().int().positive(), reason: z.string() }),
      run: async ({ payment_id, amount, reason }) => {
        const p = w.payments.find(p => p.id === payment_id) ?? fail(`No payment ${payment_id}`);
        const already = w.refunds.filter(r => r.payment_id === payment_id).reduce((s, r) => s + r.amount, 0);
        if (amount > p.amount - already) fail(`Refund of ${amount} exceeds refundable balance ${p.amount - already} on ${payment_id}`);
        const id = `ref_${String(w.refunds.length + 1).padStart(4, "0")}`;
        w.refunds.push({ id, payment_id, amount, reason, created_at: w.now });
        return j({ ok: true, refund_id: id, amount, payment_id });
      } }),
  ];
  return raw.map(t => ({
    ...t,
    run: async (input: any, ctx: any) => {
      const ev: Event = { at: Date.now(), toolUseId: ctx?.toolUse?.id ?? "?", name: t.name, input };
      log.push(ev);
      try { const r = await (t as any).run(input, ctx); ev.result = r; return r; }
      catch (e) { ev.error = String(e); throw e; }
    },
  }));
}
