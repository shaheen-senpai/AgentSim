// Tool aliases as a team types them, and back again.
//
// An Agent's `toolAliases` is `{ their_name: our_tool }` — what the agent already calls a tool,
// mapped to the tool the World pack actually publishes. The registry stores a record; a person
// edits lines. This module is the only place that conversion lives, and it is pure so it can be
// tested without a DOM (`tests/ui/aliases.test.ts`). The API remains the authority on what is
// accepted — this exists to say what is wrong before a round trip, not instead of one.

export type AliasParse = { aliases: Record<string, string>; errors: string[] };

const COMMENT = /^\s*#/;

/**
 * `their_name: our_tool` per line. Blank lines and `#` comments are ignored; a line without a
 * colon, with an empty side, or repeating a name already mapped is reported and skipped, so a
 * single bad line never silently drops the rest of the map.
 */
export function parseAliases(text: string): AliasParse {
  const aliases: Record<string, string> = {};
  const errors: string[] = [];

  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || COMMENT.test(line)) return;
    const at = line.indexOf(":");
    if (at === -1) {
      errors.push(`Line ${i + 1}: expected "their_name: our_tool".`);
      return;
    }
    const theirs = line.slice(0, at).trim();
    const ours = line.slice(at + 1).trim();
    if (theirs === "" || ours === "") {
      errors.push(`Line ${i + 1}: both sides of the colon are required.`);
      return;
    }
    if (theirs in aliases) {
      errors.push(`Line ${i + 1}: '${theirs}' is already mapped to '${aliases[theirs]}'.`);
      return;
    }
    aliases[theirs] = ours;
  });

  return { aliases, errors };
}

/** The inverse, for editing an Agent that is already registered. Stable order, so a save is a no-op diff. */
export function formatAliases(aliases: Record<string, string>): string {
  return Object.keys(aliases)
    .sort()
    .map((theirs) => `${theirs}: ${aliases[theirs]}`)
    .join("\n");
}

export type AgentDraft = { name: string; version: string; aliasText: string };

/** What must be true before `POST /api/agents` is worth attempting. */
export function draftErrors(draft: AgentDraft): string[] {
  const errors: string[] = [];
  if (draft.name.trim() === "") errors.push("Give the agent a name.");
  if (draft.version.trim() === "") errors.push("Give the agent a version.");
  errors.push(...parseAliases(draft.aliasText).errors);
  return errors;
}
