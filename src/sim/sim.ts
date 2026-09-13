import type { Event, World } from "./types";
import { ToolError, executeTool } from "./tools";

export type Sim = {
  world: World;
  events: Event[];
  execute(tool: string, input: unknown, toolUseId?: string): Promise<string>;
};

/** Wraps a World: every tool call becomes an Event, and calls run one at a time. */
export function createSim(world: World, onEvent?: (e: Event) => void): Sim {
  const events: Event[] = [];
  let chain: Promise<unknown> = Promise.resolve();

  const execute = (tool: string, input: unknown, toolUseId?: string): Promise<string> => {
    const task = chain.then(() => {
      const ev: Event = {
        seq: events.length + 1,
        at: Date.now(),
        toolUseId: toolUseId ?? `local_${events.length + 1}`,
        tool,
        input: (input ?? {}) as Record<string, unknown>,
        isError: false,
        changes: [],
      };
      try {
        const { result, changes, args } = executeTool(world, tool, input);
        ev.input = args;
        ev.result = result;
        ev.changes = changes;
        events.push(ev);
        onEvent?.(ev);
        return result;
      } catch (e) {
        ev.isError = true;
        ev.error = e instanceof Error ? e.message : String(e);
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
