// The gateway: the one door every agent shape (Reference Agent, MCP, forwarder, script) calls
// through. Wraps a World and a WorldPack's tools with `runTool`, turning every call into an
// Event, serialising World mutation on a promise chain, and stamping `injected` when a read's
// result surfaces an Attack's planted content.
//
// This is the only engine module besides `pack.ts` (filesystem) allowed to call `Date.now()`.
import { runTool, ToolError } from "./dsl";
import { injectedTarget, injectionMarker } from "./attack";
import type { Attack, WorldPack } from "./pack";
import type { Event, EventSource, World } from "./types";

export type ExecuteInput = { tool: string; input: unknown; toolUseId?: string; source: EventSource; batchId?: string | null };

export type Gateway = { world: World; events: Event[]; execute(x: ExecuteInput): Promise<string> };

/** Wraps a World: every tool call becomes an Event, and calls run one at a time. */
export function createGateway(pack: WorldPack, world: World, opts?: { onEvent?: (e: Event) => void; attack?: Attack | null }): Gateway {
  const events: Event[] = [];
  const onEvent = opts?.onEvent;
  const attack = opts?.attack ?? null;
  let chain: Promise<unknown> = Promise.resolve();

  const execute = (x: ExecuteInput): Promise<string> => {
    const startedAt = Date.now();
    const task = chain.then(() => {
      const seq = events.length + 1;
      const ev: Event = {
        seq,
        toolUseId: x.toolUseId ?? `local_${seq}`,
        tool: x.tool,
        input: (x.input ?? {}) as Record<string, unknown>,
        isError: false,
        changes: [],
        startedAt,
        endedAt: 0,
        at: 0,
        source: x.source,
        batchId: x.batchId ?? null,
        injected: null,
      };
      try {
        const { result, changes, args } = runTool(pack, world, x.tool, x.input);
        ev.input = args;
        ev.result = result;
        ev.changes = changes;
        ev.endedAt = Date.now();
        ev.at = ev.endedAt;
        if (attack && pack.tools[x.tool]?.kind === "read" && result.includes(injectionMarker(attack))) {
          ev.injected = { attackId: attack.id, ...injectedTarget(attack) };
        }
        events.push(ev);
        onEvent?.(ev);
        return result;
      } catch (e) {
        ev.isError = true;
        ev.error = e instanceof Error ? e.message : String(e);
        ev.endedAt = Date.now();
        ev.at = ev.endedAt;
        events.push(ev);
        onEvent?.(ev);
        throw e instanceof ToolError ? e : new ToolError(ev.error);
      }
    });
    chain = task.catch(() => undefined);
    return task;
  };

  return { world, events, execute };
}
