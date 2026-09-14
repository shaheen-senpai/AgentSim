// A tiny, hand-built WorldPack (no filesystem, no YAML) for tests that need precise control
// over a read/write tool pair — e.g. proving the gateway's injected-content gate really does
// key off `kind: read` rather than incidentally never matching.
import type { WorldPack } from "@/engine/pack";

export function minimalPack(): WorldPack {
  return {
    meta: {
      id: "mini",
      name: "Mini",
      domain: "test",
      description: "",
      principal: "notes",
      systems: { sys: { label: "Sys" } },
      entities: {
        notes: { label: "Note", owner: "self", fields: { id: { type: "string" }, text: { type: "text" } } },
      },
    },
    seed: { now: "2026-01-01T00:00:00Z", currency: "USD", rows: { notes: [{ id: "note_1", text: "hello" }] } },
    tools: {
      read_note: {
        name: "read_note",
        system: "sys",
        kind: "read",
        description: "Read a note.",
        input: { note_id: { type: "string" } },
        subject: { collection: "notes", id: "${input.note_id}" },
        op: "get",
        collection: "notes",
        id: "${input.note_id}",
      },
      echo_write: {
        name: "echo_write",
        system: "sys",
        kind: "write",
        description: "Overwrite a note's text, echoing it back in the result.",
        input: { note_id: { type: "string" }, text: { type: "string" } },
        subject: { collection: "notes", id: "${input.note_id}" },
        op: "update",
        collection: "notes",
        id: "${input.note_id}",
        set: { text: "${input.text}" },
        returns: { ok: true, text: "${entity.text}" },
      },
    },
    scenarios: [],
    agents: {},
    files: {},
  };
}
