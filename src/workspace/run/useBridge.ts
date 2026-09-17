"use client";
// The bridge probe, as a hook: one check on mount and one per press of "Test bridge". Deliberately
// not a poller — the answer only changes when someone starts or stops their endpoint, and a Run
// page polling a third-party URL every second is a good way to get AgentSim rate-limited by it.
import { useCallback, useEffect, useState } from "react";
import type { BridgeProbe } from "./bridge";

export function useBridge(agentId: string, enabled: boolean): { probe: BridgeProbe | null; checking: boolean; check: () => void } {
  const [probe, setProbe] = useState<BridgeProbe | null>(null);
  const [checking, setChecking] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on disable, not derived state
      setProbe(null);
      return;
    }
    let stopped = false;
    setChecking(true);
    fetch(`/api/agents/${agentId}/bridge`, { cache: "no-store" })
      .then((res) => res.json() as Promise<BridgeProbe>)
      .then((data) => { if (!stopped) setProbe(data); })
      .catch(() => { if (!stopped) setProbe({ reachable: false, detail: "AgentSim could not run the check." }); })
      .finally(() => { if (!stopped) setChecking(false); });
    return () => { stopped = true; };
  }, [agentId, enabled, nonce]);

  return { probe, checking, check: useCallback(() => setNonce((n) => n + 1), []) };
}
