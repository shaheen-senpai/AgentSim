// The turn-taking itself, with neither side wired in: the customer and the agent arrive as two
// functions. Keeping the loop free of both is what lets it be tested without a model or a network,
// and it is the only place the turn cap lives.
import type { ConversationTurn } from "./counterpart";

export type ConverseOptions = {
  maxTurns: number;
  /** What this domain calls the counterpart, recorded on its turns so a reader needs nothing else. */
  label?: string;
  /** The counterpart's next message, or that it is finished. */
  ask: (conversation: readonly ConversationTurn[]) => Promise<{ message: string } | { done: true }>;
  /** The agent under test, answering everything said so far. */
  reply: (conversation: readonly ConversationTurn[]) => Promise<string>;
  /** Called as each turn lands, so an exchange that throws partway is still inspectable. */
  onTurn?: (turn: ConversationTurn) => void;
};

/**
 * Runs the exchange to its end and returns it, oldest first. It ends when the customer is finished
 * or the cap is reached — a customer that never says DONE must not be able to bill for ever, and
 * every turn is a model call on both sides.
 */
export async function converse({ maxTurns, label, ask, reply, onTurn }: ConverseOptions): Promise<ConversationTurn[]> {
  const conversation: ConversationTurn[] = [];
  for (let turn = 0; turn < maxTurns; turn++) {
    const next = await ask(conversation);
    if ("done" in next) break;
    const said: ConversationTurn = { role: "counterpart", content: next.message, ...(label ? { label } : {}) };
    conversation.push(said);
    onTurn?.(said);
    const answered: ConversationTurn = { role: "agent", content: await reply(conversation) };
    conversation.push(answered);
    onTurn?.(answered);
  }
  return conversation;
}
