import { useEffect } from "react";
import type { Workspace } from "@puppyone/shared-ui";

export function useWorkspaceFileWatch({
  onGitRefresh,
  onWorkspaceContentChanged,
  workspace,
  workspaceIsCloud,
}: {
  onGitRefresh: () => void;
  onWorkspaceContentChanged: () => void;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
}) {
  useEffect(() => {
    if (!workspace || workspaceIsCloud || !window.puppyoneDesktop?.watchWorkspace) return undefined;

    return window.puppyoneDesktop.watchWorkspace(workspace.path, (event) => {
      if (!event.error) {
        onWorkspaceContentChanged();
        onGitRefresh();
      }
    });
  }, [onGitRefresh, onWorkspaceContentChanged, workspace, workspaceIsCloud]);
}
