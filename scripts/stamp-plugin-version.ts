// Writes the content-derived version into both of the plugin's manifests, so `/plugin update`
// actually copies. Run it after changing anything under `claude-plugin/`:
//
//   npm run plugin:version
//
// Then `/plugin update agentsim-worldbuilder@agentsim` and `/reload-plugins` in Claude Code.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { declaredVersions, MANIFESTS, pluginDir, stampedVersion } from "@/lib/pluginVersion";

const dir = pluginDir();
const want = stampedVersion(dir);
const had = declaredVersions(dir);

let changed = false;
for (const rel of MANIFESTS) {
  const file = path.join(dir, rel);
  const text = readFileSync(file, "utf8");
  const next = text.replace(/"version":(\s*)"[^"]*"/g, `"version":$1"${want}"`);
  if (next !== text) {
    writeFileSync(file, next);
    changed = true;
  }
  console.log(`${rel}: ${had[rel] || "(none)"} -> ${want}`);
}

console.log(changed ? `\nStamped ${want}. Run /plugin update then /reload-plugins to pick it up.` : `\nAlready stamped ${want}; nothing to do.`);
