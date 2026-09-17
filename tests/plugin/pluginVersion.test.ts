// The plugin's version is the cache key `/plugin update` compares, so a version that does not move
// when the plugin's content moves means Claude Code reports "already at the latest version" and
// keeps serving a stale `SKILL.md`. This test is the enforcement: change anything under
// `claude-plugin/` without running `npm run plugin:version` and it fails here rather than silently
// in someone's session.
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { baseVersion, contentHash, declaredVersions, MANIFESTS, shippedFiles, stampedVersion } from "@/lib/pluginVersion";

describe("the plugin's stamped version", () => {
  it("is what both manifests declare — run `npm run plugin:version` if this fails", () => {
    const want = stampedVersion();
    for (const rel of MANIFESTS) expect(declaredVersions()[rel], `${rel} is stale`).toBe(want);
  });

  it("carries a hand-owned base and a content hash", () => {
    expect(stampedVersion()).toMatch(/^\d+\.\d+\.\d+\+[0-9a-f]{8}$/);
  });

  it("covers every file the plugin ships", () => {
    const files = shippedFiles();
    expect(files).toContain("skills/init-world/SKILL.md");
    expect(files).toContain(".mcp.json");
    for (const rel of MANIFESTS) expect(files).toContain(rel);
  });
});

describe("contentHash", () => {
  /** A throwaway plugin tree, so the assertions are about the hash and not about our own manifest. */
  function fixture(skill: string, version = "1.0.0"): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "agentsim-plugin-"));
    mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
    mkdirSync(path.join(dir, "skills/x"), { recursive: true });
    writeFileSync(path.join(dir, ".claude-plugin/plugin.json"), JSON.stringify({ name: "p", version }, null, 2));
    writeFileSync(path.join(dir, ".claude-plugin/marketplace.json"), JSON.stringify({ plugins: [{ name: "p", version }] }, null, 2));
    writeFileSync(path.join(dir, "skills/x/SKILL.md"), skill);
    return dir;
  }

  it("moves when a shipped file changes", () => {
    expect(contentHash(fixture("before"))).not.toBe(contentHash(fixture("after")));
  });

  it("ignores the manifests' own version, so stamping is idempotent", () => {
    // Otherwise stamping changes the content, which changes the hash, which needs another stamp.
    expect(contentHash(fixture("same", "1.0.0"))).toBe(contentHash(fixture("same", "9.9.9+deadbeef")));
  });

  it("strips a previous stamp off the base rather than compounding it", () => {
    expect(baseVersion("0.2.0+63e8f5e0")).toBe("0.2.0");
    expect(baseVersion("0.2.0")).toBe("0.2.0");
  });
});
