// The plugin's version is what `/plugin update` compares, and the cache directory it copies into is
// named after it. So a version that does not move when the plugin's content moves is a silent
// staleness bug: Claude Code answers "already at the latest version", copies nothing, and keeps
// serving the old `SKILL.md`. That is not hypothetical — it is how a rewritten skill sat unused
// while its repo copy looked correct.
//
// The fix is to make the version a function of the content: `<base>+<hash of everything shipped>`.
// The base stays hand-owned, so a human still decides when this is 0.3.0; the hash moves on its own
// the moment any shipped byte changes. `tests/plugin/pluginVersion.test.ts` fails when the stamp is
// stale, which is what keeps the two in step without a git hook.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Both manifests carry a `version`, and nothing else kept them in step. */
export const MANIFESTS = [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"] as const;

export function pluginDir(): string {
  return path.join(process.cwd(), "claude-plugin");
}

/** Every file the plugin ships, as paths relative to `claude-plugin/`, in a stable order. */
export function shippedFiles(dir = pluginDir()): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const name of readdirSync(path.join(dir, rel)).sort()) {
      const next = rel ? path.join(rel, name) : name;
      if (statSync(path.join(dir, next)).isDirectory()) walk(next);
      else out.push(next);
    }
  };
  walk("");
  return out;
}

/** `0.2.0+a1b2c3d4` -> `0.2.0`. The part a human owns. */
export function baseVersion(version: string): string {
  return version.split("+")[0];
}

/**
 * The content hash. A manifest's own `version` is normalised out before hashing, so stamping is
 * idempotent — the hash describes the plugin, not the last hash of it.
 */
export function contentHash(dir = pluginDir()): string {
  const h = createHash("sha256");
  for (const rel of shippedFiles(dir)) {
    const text = readFileSync(path.join(dir, rel), "utf8");
    h.update(rel);
    h.update("\0");
    h.update((MANIFESTS as readonly string[]).includes(rel) ? text.replace(/"version":(\s*)"[^"]*"/g, '"version":$1"<stamped>"') : text);
    h.update("\0");
  }
  return h.digest("hex").slice(0, 8);
}

/** The version both manifests should carry, given what is on disk right now. */
export function stampedVersion(dir = pluginDir()): string {
  const declared = JSON.parse(readFileSync(path.join(dir, MANIFESTS[0]), "utf8")) as { version?: string };
  return `${baseVersion(declared.version ?? "0.0.0")}+${contentHash(dir)}`;
}

/** What each manifest declares today, keyed by its path. */
export function declaredVersions(dir = pluginDir()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of MANIFESTS) {
    const m = /"version":\s*"([^"]*)"/.exec(readFileSync(path.join(dir, rel), "utf8"));
    out[rel] = m ? m[1] : "";
  }
  return out;
}
