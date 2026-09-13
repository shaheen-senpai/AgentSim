import type { Seed, Snapshot, World } from "./types";

export function seedWorld(seed: Seed): World {
  const { id: _id, name: _name, ...world } = seed;
  return structuredClone({ ...world, refunds: world.refunds ?? [] });
}

export function snapshot(w: World): Snapshot {
  return structuredClone(w);
}

/** The Customer an entity belongs to. Orders → customer; Payments → Order; Refunds → Payment; Emails → Thread. */
export function ownerOf(w: World, id: string): string | null {
  switch (id.split("_")[0]) {
    case "cus":
      return w.customers.some((c) => c.id === id) ? id : null;
    case "ord":
      return w.orders.find((o) => o.id === id)?.customer_id ?? null;
    case "pay": {
      const p = w.payments.find((p) => p.id === id);
      return p ? ownerOf(w, p.order_id) : null;
    }
    case "ref": {
      const r = w.refunds.find((r) => r.id === id);
      return r ? ownerOf(w, r.payment_id) : null;
    }
    case "thr":
      return w.threads.find((t) => t.id === id)?.customer_id ?? null;
    case "eml": {
      const e = w.emails.find((e) => e.id === id);
      return e ? ownerOf(w, e.thread_id) : null;
    }
    case "tkt":
      return w.tickets.find((t) => t.id === id)?.customer_id ?? null;
    default:
      return null;
  }
}
