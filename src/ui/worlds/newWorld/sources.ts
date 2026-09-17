// The New world composer's data model: the sources a World is built from, how each is labelled, and
// how the set folds into `POST /api/worlds/generate`'s input. Pure; `tests/ui/sources.test.ts`.

export type ProviderInfo = { id: string; label: string; kind: string; hue: string; tools: { name: string; description: string }[] };
export type PackPick = { id: string; name: string; domain: string; description: string; entities: number; tools: number };

export type Source =
  | { kind: "mcp"; provider: string }
  | { kind: "tools"; format: "mcp" | "openapi" | "ts"; text: string }
  | { kind: "db"; ddl: string }
  | { kind: "pack"; packId: string };

/** The mock's source badge text, plus the object-store kind it shows as roadmap. */
export const SRC_KIND: Record<Source["kind"] | "s3", string> = { mcp: "MCP", db: "database", s3: "object store", tools: "own tools", pack: "pack" };

export const FORMAT_LABEL: Record<Extract<Source, { kind: "tools" }>["format"], string> = { mcp: "MCP tools/list", openapi: "OpenAPI", ts: "TypeScript" };

export function srcLabel(s: Source, providers: ProviderInfo[], packs: PackPick[]): string {
  switch (s.kind) {
    case "mcp":
      return providers.find((p) => p.id === s.provider)?.label ?? s.provider;
    case "tools":
      return `Your tools (${FORMAT_LABEL[s.format]})`;
    case "db":
      return "Pasted schema";
    case "pack":
      return packs.find((p) => p.id === s.packId)?.name ?? s.packId;
  }
}

export function srcMode(s: Source): "shadowed" | "pasted" | "mocked" | "copied" {
  return s.kind === "mcp" ? "shadowed" : s.kind === "tools" ? "pasted" : s.kind === "db" ? "mocked" : "copied";
}

/** How many tools a source contributes, when that is known before generation. */
export function srcToolCount(s: Source, providers: ProviderInfo[], packs: PackPick[]): number | null {
  if (s.kind === "mcp") return providers.find((p) => p.id === s.provider)?.tools.length ?? null;
  if (s.kind === "pack") return packs.find((p) => p.id === s.packId)?.tools ?? null;
  return null;
}

/** The pack id when the composition is exactly one copied pack — created instantly, no generation. */
export function isCopyOnly(sources: Source[]): string | null {
  return sources.length === 1 && sources[0].kind === "pack" ? sources[0].packId : null;
}

/** A World id from a name — the same rule the server enforces (`PACK_ID_RE`), or `""` when nothing valid remains. */
export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 41).replace(/-+$/g, "");
  return /^[a-z0-9][a-z0-9-]{1,40}$/.test(s) ? s : "";
}

export type ReviewFields = { name: string; domain: string; principal: string; description: string };
export type GenerateBody = { name: string; domain: string; description: string; schema?: string; tools?: string; openapi?: string };

function sourceSentence(s: Source, providers: ProviderInfo[]): string {
  switch (s.kind) {
    case "mcp":
      return `${srcLabel(s, providers, [])} (shadowed over MCP)`;
    case "tools":
      return `your own tools (${FORMAT_LABEL[s.format]})`;
    case "db":
      return "a pasted database schema";
    case "pack":
      return `a copy of the installed pack ${s.packId}`;
  }
}

/**
 * Provider catalogs and pasted tool text become the generator's `tools`; OpenAPI its `openapi`;
 * DDL its `schema`. The principal and the source list ride along in the description, which is the
 * only free-text field the generator reads.
 */
export function toGenerateInput(sources: Source[], f: ReviewFields, providers: ProviderInfo[]): GenerateBody {
  const catalog = sources.flatMap((s) => (s.kind === "mcp" ? (providers.find((p) => p.id === s.provider)?.tools.map((t) => `- ${t.name}: ${t.description}`) ?? []) : []));
  const pasted = sources.flatMap((s) => (s.kind === "tools" && s.format !== "openapi" && s.text.trim() ? [s.text.trim()] : []));
  const openapi = sources.flatMap((s) => (s.kind === "tools" && s.format === "openapi" && s.text.trim() ? [s.text.trim()] : [])).join("\n\n");
  const schema = sources.flatMap((s) => (s.kind === "db" && s.ddl.trim() ? [s.ddl.trim()] : [])).join("\n\n");
  const tools = [catalog.join("\n"), ...pasted].filter(Boolean).join("\n\n");
  const lines = [f.description.trim(), ""];
  if (f.principal.trim()) lines.push(`Principal: ${f.principal.trim()}.`);
  if (sources.length > 0) lines.push(`Sources: ${sources.map((s) => sourceSentence(s, providers)).join("; ")}.`);
  return {
    name: f.name.trim(),
    domain: f.domain.trim(),
    description: lines.join("\n"),
    ...(schema ? { schema } : {}),
    ...(tools ? { tools } : {}),
    ...(openapi ? { openapi } : {}),
  };
}
