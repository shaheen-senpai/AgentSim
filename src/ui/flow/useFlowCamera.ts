"use client";
import { useCallback, useEffect, useState } from "react";
import { useNodesInitialized, useReactFlow } from "@xyflow/react";
import { NODE_H, NODE_W, type FlowNode } from "./buildFlow";

/** A fit that zooms out past this is unreadable; below it the reader pans instead (Task 13 review). */
export const FIT = { padding: 0.2, minZoom: 0.5 } as const;
/** Must match `EventDrawer`'s width: the camera centres on the pane, but the reader sees its left. */
const DRAWER_W = 380;

const reducedMotion = (): boolean => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
const duration = (): number => (reducedMotion() ? 0 : 300);

export type FlowCamera = {
  /** `fitView` with the legibility floor — the toolbar's *fit*, `<Controls>` and a pane double-click. */
  fit: () => void;
  /** Whether `<ReactFlow fitView>` should run on mount, decided once. */
  fitOnMount: boolean;
  /** Bring a node into the part of the pane the drawer is not covering. */
  centreOn: (node: FlowNode) => void;
};

/**
 * The flow's camera (spec §6.1): it follows the newest node while the Run is running and the newest
 * *visible* node while replaying, and it fits — never below `FIT.minZoom` — when asked. A finished
 * Run shown in full is left where the fit put it: the whole Run.
 */
export function useFlowCamera({ chasing, newest, drawerOpen, fitSignal }: { chasing: boolean; newest: FlowNode | null; drawerOpen: boolean; fitSignal: number }): FlowCamera {
  const { setCenter, fitView } = useReactFlow();
  // `setCenter` is a no-op until xyflow has adopted the nodes, so a follow issued on the very first
  // render would be silently dropped — wait for this instead (true from the first commit, because
  // every node hands xyflow its own `measured` size).
  const ready = useNodesInitialized();
  // A queued `fitView` runs after our first `setCenter` and would undo it, so a Run that opens
  // chasing (live, or mid-Replay) never asks for one; a finished Run opens fitted to the whole Run.
  const [fitOnMount] = useState(() => !chasing);

  // The drawer covers the pane's right-hand 380 px, so while it is open the camera aims half a
  // drawer to the right and the node lands in what is actually visible. Everything here centres at
  // `zoom: 1`, so the offset needs no scaling.
  const centreAt = useCallback(
    (x: number, y: number, offset: boolean) => {
      if (!ready) return;
      void setCenter(x + NODE_W / 2 + (offset ? DRAWER_W / 2 : 0), y + NODE_H / 2, { zoom: 1, duration: duration() });
    },
    [ready, setCenter],
  );

  const newestX = newest?.position.x ?? 0;
  const newestY = newest?.position.y ?? 0;
  const newestId = newest?.id ?? null;
  useEffect(() => {
    if (!chasing) return;
    centreAt(newestX, newestY, drawerOpen);
  }, [chasing, newestId, newestX, newestY, drawerOpen, centreAt]);

  const fit = useCallback(() => void fitView({ ...FIT, duration: duration() }), [fitView]);
  useEffect(() => {
    if (fitSignal === 0) return;
    fit();
  }, [fitSignal, fit]);

  // Only ever called to reveal a node the drawer is about to show, so it always aims past it.
  const centreOn = useCallback((node: FlowNode) => centreAt(node.position.x, node.position.y, true), [centreAt]);

  return { fit, fitOnMount, centreOn };
}
