import { useCallback } from "react";
import type { DataPort, Workspace } from "@puppyone/shared-ui";
import { openWorkspaceEntryExternal } from "../../lib/localFiles";

type UseExternalFileOpenOptions = {
  onActionSettled?: () => void;
  onError: (message: string | null) => void;
  workspace: Workspace | null;
  dataPort?: DataPort | null;
};

export function useExternalFileOpen({
  onActionSettled,
  onError,
  workspace,
  dataPort = null,
}: UseExternalFileOpenOptions) {
  const open = useCallback(async (path: string) => {
    if (!workspace) return;

    onError(null);
    try {
      if (dataPort?.openExternalFile) await dataPort.openExternalFile(path);
      else await openWorkspaceEntryExternal({ rootPath: workspace.path, path });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      onActionSettled?.();
    }
  }, [dataPort, onActionSettled, onError, workspace]);

  return { open };
}
