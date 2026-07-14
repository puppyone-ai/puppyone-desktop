import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { DataNode, Workspace } from "@puppyone/shared-ui";
import {
  openWorkspaceEntryExternal,
  resolveWorkspaceExternalOpenTarget,
} from "../../lib/localFiles";
import {
  getExternalAppExtension,
  getExternalAppOverrideForExtension,
  upsertExternalAppOverride,
  type ExternalAppsSettings,
} from "../../preferences";
import type { WorkspaceExternalOpenTarget } from "../../types/electron";

type UseActiveExternalOpenTargetOptions = {
  activeDataNode: DataNode | null;
  activeDataPath: string | null;
  activeViewIsData: boolean;
  externalAppsSettings: ExternalAppsSettings;
  onActionSettled?: () => void;
  onError: (message: string | null) => void;
  setExternalAppsSettings: Dispatch<SetStateAction<ExternalAppsSettings>>;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
};

export function useActiveExternalOpenTarget({
  activeDataNode,
  activeDataPath,
  activeViewIsData,
  externalAppsSettings,
  onActionSettled,
  onError,
  setExternalAppsSettings,
  workspace,
  workspaceIsCloud,
}: UseActiveExternalOpenTargetOptions) {
  const [externalOpenTarget, setExternalOpenTarget] = useState<WorkspaceExternalOpenTarget | null>(null);
  const [externalOpenTargetLoading, setExternalOpenTargetLoading] = useState(false);
  const [externalOpenTargetPath, setExternalOpenTargetPath] = useState<string | null>(null);
  const activeDataNodePath = activeDataNode?.path ?? null;
  const activeDataNodeName = activeDataNode?.name ?? null;
  const activeDataNodeType = activeDataNode?.type ?? null;
  const activeExternalFilePath = activeViewIsData
    && activeDataNodePath
    && activeDataNodeType !== "folder"
    ? activeDataNodePath
    : null;

  const activeExternalFileExtension = useMemo(() => (
    activeExternalFilePath
      ? getExternalAppExtension(activeExternalFilePath)
      : null
  ), [activeExternalFilePath]);

  const activeExternalAppOverride = useMemo(() => (
    getExternalAppOverrideForExtension(externalAppsSettings, activeExternalFileExtension)
  ), [activeExternalFileExtension, externalAppsSettings]);

  const syncExternalAppOverrideIcon = useCallback((target: WorkspaceExternalOpenTarget | null) => {
    if (!target?.appPath || !target.extension || !target.iconDataUrl) return;
    const extension = target.extension;
    const appPath = target.appPath;
    const appName = target.appName;
    const bundleId = target.bundleId;
    const iconDataUrl = target.iconDataUrl;

    setExternalAppsSettings((currentSettings) => {
      const currentOverride = getExternalAppOverrideForExtension(currentSettings, extension);
      if (!currentOverride || currentOverride.appPath !== appPath) return currentSettings;
      if (
        currentOverride.appName === appName
        && currentOverride.bundleId === bundleId
        && currentOverride.iconDataUrl === iconDataUrl
      ) {
        return currentSettings;
      }

      return upsertExternalAppOverride(currentSettings, {
        extension,
        appPath,
        appName,
        bundleId,
        iconDataUrl,
      });
    });
  }, [setExternalAppsSettings]);

  useEffect(() => {
    if (!workspace || workspaceIsCloud || !activeExternalFilePath) {
      setExternalOpenTarget(null);
      setExternalOpenTargetLoading(false);
      setExternalOpenTargetPath(null);
      return;
    }

    let cancelled = false;
    const requestPath = activeExternalFilePath;
    const optimisticTarget: WorkspaceExternalOpenTarget | null = activeExternalAppOverride
      ? {
          appName: activeExternalAppOverride.appName ?? null,
          appPath: activeExternalAppOverride.appPath,
          bundleId: activeExternalAppOverride.bundleId ?? null,
          extension: activeExternalFileExtension,
          iconDataUrl: null,
          source: "override",
        }
      : null;
    setExternalOpenTarget(optimisticTarget);
    setExternalOpenTargetPath(requestPath);
    setExternalOpenTargetLoading(true);

    resolveWorkspaceExternalOpenTarget({
      rootPath: workspace.path,
      path: requestPath,
      extension: activeExternalFileExtension,
      overrideAppPath: activeExternalAppOverride?.appPath ?? null,
    })
      .then((target) => {
        if (cancelled) return;
        setExternalOpenTarget(target);
        setExternalOpenTargetPath(requestPath);
        setExternalOpenTargetLoading(false);
        syncExternalAppOverrideIcon(target);
      })
      .catch(() => {
        if (cancelled) return;
        const fallbackTarget = optimisticTarget ?? {
          appName: null,
          appPath: null,
          bundleId: null,
          extension: activeExternalFileExtension,
          iconDataUrl: null,
          source: "unknown",
        };
        setExternalOpenTarget(fallbackTarget);
        setExternalOpenTargetPath(requestPath);
        setExternalOpenTargetLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeExternalAppOverride,
    activeExternalFileExtension,
    activeExternalFilePath,
    syncExternalAppOverrideIcon,
    workspace,
    workspaceIsCloud,
  ]);

  const openActiveFileExternal = useCallback(async () => {
    if (!workspace || workspaceIsCloud || !activeExternalFilePath) return;

    onError(null);
    try {
      await openWorkspaceEntryExternal({
        rootPath: workspace.path,
        path: activeExternalFilePath,
        strategy: activeExternalAppOverride ? "app" : externalAppsSettings.openMode,
        appPath: activeExternalAppOverride?.appPath ?? null,
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      onActionSettled?.();
    }
  }, [
    activeExternalAppOverride,
    activeExternalFilePath,
    externalAppsSettings.openMode,
    onActionSettled,
    onError,
    workspace,
    workspaceIsCloud,
  ]);

  const canOpenActiveFileExternal = activeViewIsData
    && !workspaceIsCloud
    && activeExternalFilePath !== null
    && activeExternalFilePath === activeDataPath;
  const activeExternalOpenPath = canOpenActiveFileExternal ? activeExternalFilePath : null;
  const activeFileExternalOpenLoading = Boolean(
    activeExternalOpenPath
      && (externalOpenTargetLoading || externalOpenTargetPath !== activeExternalOpenPath),
  );
  const activeFileExternalOpenTarget = activeFileExternalOpenLoading ? null : externalOpenTarget;

  return {
    appName: activeFileExternalOpenTarget?.appName ?? null,
    canOpen: canOpenActiveFileExternal,
    iconDataUrl: activeFileExternalOpenTarget?.iconDataUrl ?? null,
    loading: activeFileExternalOpenLoading,
    openActiveFileExternal,
    title: canOpenActiveFileExternal
      ? `Open ${activeDataNodeName ?? activeExternalFilePath} in ${activeFileExternalOpenTarget?.appName ?? "macOS default"}`
      : undefined,
  };
}
