// One line of a scripted terminal panel (the World-drafting and agent-registering animations).
export type HandshakeStep = { text: string; at: number; done?: boolean };

export function handshakeDuration(steps: HandshakeStep[]): number {
  return steps.at(-1)?.at ?? 0;
}
