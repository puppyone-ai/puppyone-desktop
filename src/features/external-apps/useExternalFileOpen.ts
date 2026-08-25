import { useCallback } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { openWorkspaceEntryExternal } from "../../lib/localFiles";

type UseExternalFileOpenOptions = {
  onActionSettled?: () => void;
  onError: (message: string | null) => void;
  workspace: Workspace | null;
};

export function useExternalFileOpen({
  onActionSettled,
  onError,
  workspace,
}: UseExternalFileOpenOptions) {
  const open = useCallback(async (path: string) => {
    if (!workspace) return;

    onError(null);
    try {
      await openWorkspaceEntryExternal({
        rootPath: workspace.path,
        path,
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      onActionSettled?.();
    }
  }, [onActionSettled, onError, workspace]);

  return { open };
}
