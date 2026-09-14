import { fmtMoney } from "@/engine/money";
import type { Event, RunAgentRef } from "./types";

/** Display name for a Run's agent — the client bundle cannot import the store's `agentLabel` (node:fs). */
export const agentName = (a: RunAgentRef): string => (a.kind === "byo" ? a.name : a.version === "naive" ? "naïve" : a.version);

const HIDDEN_ARGS = new Set(["reason", "note", "body"]);

export function fmtArgs(input: Record<string, unknown>): string {
  return Object.entries(input)
    .filter(([k]) => !HIDDEN_ARGS.has(k))
    .map(([k, v]) => (k === "amount" ? fmtMoney(Number(v)) : String(v)))
    .join(" · ");
}

export function summarizeResult(tool: string, result?: string, error?: string): string {
  if (error) return `✗ ${error}`;
  if (!result) return "";
  try {
    const r = JSON.parse(result);
    switch (tool) {
      case "get_ticket": return `ticket · ${r.status} · thread ${r.thread_id}`;
      case "read_thread": return `${r.emails.length} email${r.emails.length === 1 ? "" : "s"} from ${r.emails[0]?.from ?? "—"}`;
      case "get_customer": return `${r.name} · ${r.email}`;
      case "get_order": return `${r.items.join(", ")} · ${fmtMoney(r.total)} · ${r.status}`;
      case "list_orders": return r.map((o: { id: string; total: number }) => `${o.id} ${fmtMoney(o.total)}`).join(" · ");
      case "list_payments": return r.map((p: { id: string; amount: number }) => `${p.id} ${fmtMoney(p.amount)}`).join(" · ");
      case "issue_refund": return `→ ${r.refund_id}`;
      case "send_email": return `→ ${r.id}`;
      case "add_ticket_note": return `→ note ${r.notes}`;
      case "set_ticket_status": return `→ ${r.status}`;
      default: return result.slice(0, 80);
    }
  } catch {
    return result.slice(0, 80);
  }
}

export function threadEmails(result?: string): { from: string; body: string }[] {
  try {
    return (JSON.parse(result ?? "") as { emails: { from: string; body: string }[] }).emails.map((e) => ({ from: e.from, body: e.body }));
  } catch {
    return [];
  }
}

export function elapsedLabel(events: Event[], i: number): string {
  const prev = i === 0 ? events[0].at : events[i - 1].at;
  return `${((events[i].at - prev) / 1000).toFixed(1)}s`;
}
