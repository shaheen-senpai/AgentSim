export type Customer = { id: string; name: string; email: string; address: string };
export type Order = { id: string; customer_id: string; items: string[]; total: number; placed_at: string; status: string };
export type Payment = { id: string; order_id: string; amount: number; card_last4: string; status: string; created_at: string };
export type Refund = { id: string; payment_id: string; amount: number; reason: string; created_at: string };
export type Thread = { id: string; customer_id: string; subject: string };
export type Email = { id: string; thread_id: string; from: string; to: string; sent_at: string; body: string };
export type TicketStatus = "open" | "pending" | "resolved";
export type Ticket = { id: string; customer_id: string; thread_id: string; subject: string; status: TicketStatus; notes: string[] };

/** The shared business state every System reads and writes. Frozen clock: `now`. */
export type World = {
  now: string;
  currency: string;
  customers: Customer[];
  orders: Order[];
  payments: Payment[];
  refunds: Refund[];
  threads: Thread[];
  emails: Email[];
  tickets: Ticket[];
};

/** A Seed file is a World plus an identity. */
export type Seed = World & { id: string; name: string };

/** A deep copy of the World at a moment in a Run. */
export type Snapshot = World;

/** One recorded step in a Run's timeline: a tool call, its result, the World changes it caused. */
export type Event = {
  seq: number;
  at: number; // wall-clock ms, for Replay pacing only
  toolUseId: string;
  tool: string;
  input: Record<string, unknown>;
  result?: string;
  error?: string;
  isError: boolean;
  changes: string[]; // entity ids created or modified by this call
};

export const ENTITY_COLLECTIONS = ["customers", "orders", "payments", "refunds", "threads", "emails", "tickets"] as const;
export type EntityCollection = (typeof ENTITY_COLLECTIONS)[number];
