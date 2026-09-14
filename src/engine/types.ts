export type Row = { id: string } & Record<string, unknown>;

/** The shared business state every System reads and writes. Frozen clock: `now`. */
export type World = { now: string; currency: string; collections: Record<string, Row[]> };
export type Snapshot = World;

export type Change = { collection: string; id: string; op: "create" | "update" };
export type EventSource = "reference" | "mcp" | "forwarder" | "script";

/** One recorded action: the call, its result or error, the World changes it caused, and when it ran. */
export type Event = {
  seq: number;
  toolUseId: string;
  tool: string;
  input: Record<string, unknown>;
  result?: string;
  error?: string;
  isError: boolean;
  changes: Change[];
  startedAt: number; // wall-clock ms, taken when the call arrived
  endedAt: number;   // wall-clock ms, taken when the result was ready
  at: number;        // === endedAt; kept for Replay pacing
  source: EventSource;
  batchId: string | null; // same assistant turn (Reference Agent) or client-supplied
  injected: { attackId: string; collection: string; id: string; field: string } | null;
};
