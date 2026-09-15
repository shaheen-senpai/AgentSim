"use client";
import { useCallback, useState } from "react";
import type { ToolDef } from "../types";

export type FlowViewMode = "flow" | "list";

/** What the flow has selected: an Event's `seq`, one of the meta nodes, or nothing. */
export type FlowSelection = number | "start" | "end" | null;

/** The toolbar's filter state. An empty `systems` set means "no System filter" — nothing is dimmed. */
export type FlowFilters = { systems: Set<string>; writesOnly: boolean };

export type FlowState = {
  view: FlowViewMode;
  setView: (view: FlowViewMode) => void;
  selected: FlowSelection;
  select: (selection: FlowSelection) => void;
  filters: FlowFilters;
  toggleSystem: (system: string) => void;
  clearSystems: () => void;
  setWritesOnly: (on: boolean) => void;
  follow: boolean;
  setFollow: (on: boolean) => void;
  /** Bumped by `fit()`; `FlowView` watches it and calls `fitView` — keeps the toolbar free of xyflow. */
  fitSignal: number;
  fit: () => void;
};

/** The Systems a pack's tools belong to, de-duplicated. `systemColor` sorts this list itself. */
export function systemsOf(tools: Record<string, ToolDef>): string[] {
  return [...new Set(Object.values(tools).map((t) => t.system))].sort();
}

/**
 * View state for the Run's flow: which view is showing, what is selected, which Systems are
 * highlighted, and whether the camera follows the newest Event. Plain hook, no context — `RunView`
 * owns one instance and passes it to `FlowToolbar` and `FlowView`.
 */
export function useFlowState(): FlowState {
  const [view, setView] = useState<FlowViewMode>("flow");
  const [selected, select] = useState<FlowSelection>(null);
  const [systems, setSystems] = useState<Set<string>>(() => new Set());
  const [writesOnly, setWritesOnly] = useState(false);
  const [follow, setFollow] = useState(true);
  const [fitSignal, setFitSignal] = useState(0);

  const toggleSystem = useCallback((system: string) => {
    setSystems((prev) => {
      const next = new Set(prev);
      if (!next.delete(system)) next.add(system);
      return next;
    });
  }, []);

  return {
    view,
    setView,
    selected,
    select,
    filters: { systems, writesOnly },
    toggleSystem,
    clearSystems: useCallback(() => setSystems(new Set()), []),
    setWritesOnly,
    follow,
    setFollow,
    fitSignal,
    fit: useCallback(() => setFitSignal((n) => n + 1), []),
  };
}
