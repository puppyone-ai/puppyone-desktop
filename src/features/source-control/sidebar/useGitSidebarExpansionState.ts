import { useCallback, useState } from "react";
import type { GitSidebarPanelId } from "./useGitSidebarPanelLayout";

export type GitSidebarExpansionState = Record<GitSidebarPanelId, boolean>;

const DEFAULT_EXPANSION_STATE: GitSidebarExpansionState = {
  merge: true,
  committed: true,
  staged: true,
  unstaged: true,
};

/** Keeps independent disclosure state in one keyed model as panels evolve. */
export function useGitSidebarExpansionState() {
  const [expanded, setExpanded] = useState<GitSidebarExpansionState>(DEFAULT_EXPANSION_STATE);

  const toggle = useCallback((panel: GitSidebarPanelId) => {
    setExpanded((current) => ({ ...current, [panel]: !current[panel] }));
  }, []);

  return { expanded, toggle };
}
