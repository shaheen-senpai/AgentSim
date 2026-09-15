"use client";
import { useSyncExternalStore } from "react";

/** The origin never changes while the page is open, so there is nothing to subscribe to. */
const subscribe = () => () => {};
const clientOrigin = () => window.location.origin;
const serverOrigin = () => null;

/**
 * The origin this page was actually served from — `null` on the server and until hydration.
 *
 * A stored Run does not keep the URLs `POST /api/runs` handed out, so the Run page re-derives them.
 * Reading `window.location` during render would make the server and the client disagree; going
 * through `useSyncExternalStore` with an explicit server snapshot is how React is told that the two
 * differ on purpose. A tunnel, a LAN address and localhost each yield a link that resolves for
 * whoever is looking — callers render the URL only once this is non-null.
 */
export function useOrigin(): string | null {
  return useSyncExternalStore(subscribe, clientOrigin, serverOrigin);
}
