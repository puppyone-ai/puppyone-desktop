import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { DataNode, Workspace } from "@puppyone/shared-ui";
import {
  chooseWorkspaceExternalApp,
  listWorkspaceExternalOpenTargets,
  openWorkspaceEntryExternal,
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
  const [externalOpenTargets, setExternalOpenTargets] = useState<WorkspaceExternalOpenTarget[]>([]);
  const [externalOpenTargetLoading, setExternalOpenTargetLoading] = useState(false);
  const [externalOpenTargetPath, setExternalOpenTargetPath] = useState<string | null>(null);

  const activeExternalFileExtension = useMemo(() => (
    activeViewIsData && activeDataNode && activeDataNode.type !== "folder"
      ? getExternalAppExtension(activeDataNode.path)
      : null
  ), [activeDataNode?.path, activeDataNode?.type, activeViewIsData]);

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
    if (!workspace || workspaceIsCloud || !activeViewIsData || !activeDataNode || activeDataNode.type === "folder") {
      setExternalOpenTarget(null);
      setExternalOpenTargets([]);
      setExternalOpenTargetLoading(false);
      setExternalOpenTargetPath(null);
      return;
    }

    let cancelled = false;
    const requestPath = activeDataNode.path;
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
    setExternalOpenTargets(optimisticTarget ? [optimisticTarget] : []);
    setExternalOpenTargetPath(requestPath);
    setExternalOpenTargetLoading(true);

    listWorkspaceExternalOpenTargets({
      rootPath: workspace.path,
      path: requestPath,
      extension: activeExternalFileExtension,
      overrideAppPath: activeExternalAppOverride?.appPath ?? null,
    })
      .then((targets) => {
        if (cancelled) return;
        const resolvedTarget = targets[0] ?? null;
        setExternalOpenTargets(targets);
        setExternalOpenTarget(resolvedTarget);
        setExternalOpenTargetPath(requestPath);
        setExternalOpenTargetLoading(false);
        syncExternalAppOverrideIcon(resolvedTarget);
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
        setExternalOpenTargets([fallbackTarget]);
        setExternalOpenTargetPath(requestPath);
        setExternalOpenTargetLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeDataNode?.path,
    activeDataNode?.type,
    activeExternalAppOverride?.appName,
    activeExternalAppOverride?.appPath,
    activeExternalAppOverride?.bundleId,
    activeExternalFileExtension,
    activeViewIsData,
    syncExternalAppOverrideIcon,
    workspace,
    workspaceIsCloud,
  ]);

  const openActiveFileExternal = useCallback(async () => {
    if (!workspace || workspaceIsCloud || !activeDataNode || activeDataNode.type === "folder") return;

    onError(null);
    try {
      await openWorkspaceEntryExternal({
        rootPath: workspace.path,
        path: activeDataNode.path,
        strategy: activeExternalAppOverride ? "app" : externalAppsSettings.openMode,
        appPath: activeExternalAppOverride?.appPath ?? null,
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      onActionSettled?.();
    }
  }, [
    activeDataNode,
    activeExternalAppOverride,
    externalAppsSettings.openMode,
    onActionSettled,
    onError,
    workspace,
    workspaceIsCloud,
  ]);

  const openActiveFileWithExternalApp = useCallback(async (appPath: string | null) => {
    if (!workspace || workspaceIsCloud || !activeDataNode || activeDataNode.type === "folder") return;
    if (!appPath) return;

    onError(null);
    try {
      await openWorkspaceEntryExternal({
        rootPath: workspace.path,
        path: activeDataNode.path,
        strategy: "app",
        appPath,
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      onActionSettled?.();
    }
  }, [
    activeDataNode,
    onActionSettled,
    onError,
    workspace,
    workspaceIsCloud,
  ]);

  const setExternalAppDefaultForActiveFile = useCallback(async () => {
    if (!activeExternalFileExtension) return;

    onError(null);
    try {
      const target = await chooseWorkspaceExternalApp({ extension: activeExternalFileExtension });
      if (!target?.appPath) return;
      const extension = activeExternalFileExtension;
      const appPath = target.appPath;
      const appName = target.appName;
      const bundleId = target.bundleId;
      const iconDataUrl = target.iconDataUrl;
      setExternalAppsSettings((currentSettings) => upsertExternalAppOverride(currentSettings, {
        extension,
        appPath,
        appName,
        bundleId,
        iconDataUrl,
      }));
      setExternalOpenTarget(target);
      if (activeDataNode?.path) setExternalOpenTargetPath(activeDataNode.path);
      setExternalOpenTargetLoading(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      onActionSettled?.();
    }
  }, [
    activeDataNode?.path,
    activeExternalFileExtension,
    onActionSettled,
    onError,
    setExternalAppsSettings,
  ]);

  const canOpenActiveFileExternal = activeViewIsData
    && !workspaceIsCloud
    && activeDataNode?.type !== "folder"
    && activeDataNode?.path === activeDataPath;
  const activeExternalOpenPath = canOpenActiveFileExternal ? activeDataNode?.path ?? null : null;
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
    openActiveFileWithExternalApp,
    setExternalAppDefaultForActiveFile,
    targets: activeFileExternalOpenLoading ? [] : externalOpenTargets,
    title: canOpenActiveFileExternal
      ? `Open ${activeDataNode.name} in ${activeFileExternalOpenTarget?.appName ?? "macOS default"}`
      : undefined,
  };
}
