import { useCallback } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import { openWorkspaceEntryExternal } from "../../lib/localFiles";
import {
  getExternalAppExtension,
  getExternalAppOverrideForExtension,
  type ExternalAppsSettings,
} from "../../preferences";

type UseExternalFileOpenOptions = {
  externalAppsSettings: ExternalAppsSettings;
  onActionSettled?: () => void;
  onError: (message: string | null) => void;
  workspace: Workspace | null;
};

export function useExternalFileOpen({
  externalAppsSettings,
  onActionSettled,
  onError,
  workspace,
}: UseExternalFileOpenOptions) {
  const getAppName = useCallback((path: string) => {
    const extension = getExternalAppExtension(path);
    return getExternalAppOverrideForExtension(externalAppsSettings, extension)?.appName ?? null;
  }, [externalAppsSettings]);

  const open = useCallback(async (path: string) => {
    if (!workspace) return;
    const extension = getExternalAppExtension(path);
    const override = getExternalAppOverrideForExtension(externalAppsSettings, extension);

    onError(null);
    try {
      await openWorkspaceEntryExternal({
        rootPath: workspace.path,
        path,
        strategy: override ? "app" : externalAppsSettings.openMode,
        appPath: override?.appPath ?? null,
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      onActionSettled?.();
    }
  }, [externalAppsSettings, onActionSettled, onError, workspace]);

  return { getAppName, open };
}
