// Provider id → its brand mark under public/logos (see the README there). A provider without one
// falls back to an initials tile, so a new catalog never needs a logo to appear.
export const PROVIDER_LOGOS: Record<string, { src: string; /** Wordmarks are wide; icons are square. */ wide?: boolean }> = {
  "google-workspace": { src: "/logos/google-workspace.svg" },
  okta: { src: "/logos/okta.svg" },
  slack: { src: "/logos/slack.svg" },
  stripe: { src: "/logos/stripe.svg", wide: true },
  zendesk: { src: "/logos/zendesk.svg" },
};
