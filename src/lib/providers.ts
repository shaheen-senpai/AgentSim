// The provider catalogs a World can shadow (`src/providers/<id>/tools.yaml`), as the New world
// vendor grid shows them. Server-only: reads the catalog directory.
import { existsSync, readdirSync } from "node:fs";
import { loadProviderTools, providersDir } from "@/engine/pack";
import type { ProviderInfo } from "@/ui/worlds/newWorld/sources";

const KNOWN: Record<string, { label: string; kind: string; hue: string }> = {
  stripe: { label: "Stripe", kind: "payments", hue: "#7a4fa3" },
  zendesk: { label: "Zendesk", kind: "support", hue: "#2f7d4f" },
  slack: { label: "Slack", kind: "chat", hue: "#a83b6e" },
  okta: { label: "Okta", kind: "identity", hue: "#3b6ea8" },
  "google-workspace": { label: "Google Workspace", kind: "email", hue: "#b3661a" },
};

const titleCase = (id: string) => id.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** Every catalog that loads, sorted by id; one that fails to parse is simply not offered. */
export function listProviders(): ProviderInfo[] {
  const dir = providersDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .flatMap((id) => {
      try {
        const tools = Object.values(loadProviderTools(id)).map((t) => ({ name: t.name, description: t.description }));
        return [{ id, ...(KNOWN[id] ?? { label: titleCase(id), kind: "MCP", hue: "#6E6B60" }), tools }];
      } catch {
        return [];
      }
    });
}
