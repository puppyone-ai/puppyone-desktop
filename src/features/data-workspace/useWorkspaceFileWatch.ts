import { useEffect } from "react";
import type { Workspace } from "@puppyone/shared-ui";

export function useWorkspaceFileWatch({
  onGitRefresh,
  onWorkspaceContentChanged,
  workspace,
  workspaceIsCloud,
}: {
  onGitRefresh: (reason?: string) => void;
  onWorkspaceContentChanged: () => void;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
}) {
  useEffect(() => {
    if (!workspace || workspaceIsCloud || !window.puppyoneDesktop?.watchWorkspace) return undefined;

    return window.puppyoneDesktop.watchWorkspace(workspace.path, (event) => {
      if (event.error) {
        // Content-watch errors are observable but must not clear Git truth.
        // Focus reconciliation and the metadata watcher remain the recovery path.
        return;
      }
      onWorkspaceContentChanged();
      onGitRefresh("working-tree");
    });
  }, [onGitRefresh, onWorkspaceContentChanged, workspace, workspaceIsCloud]);
}
