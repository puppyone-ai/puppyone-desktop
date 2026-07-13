import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  EMPTY_VIEWER_PACK_SNAPSHOT,
  type ViewerExtensionHostAdapter,
} from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";

const LazyDesktopViewerPackSurface = lazy(() => import("./renderer").then((module) => ({
  default: module.DesktopViewerPackSurface,
})));
const LazyDesktopViewerPackFallback = lazy(() => import("./renderer").then((module) => ({
  default: module.DesktopViewerPackFallback,
})));

export function useDesktopViewerPacks({
  cloudWorkspace,
  enabled,
  workspaceKey,
  workspacePath,
}: {
  cloudWorkspace: boolean;
  enabled: boolean;
  workspaceKey: string;
  workspacePath: string | null;
}) {
  const { t } = useLocalization();
  const hostAvailable = enabled
    && typeof window !== "undefined"
    && Boolean(window.puppyoneDesktop?.viewerPacks);
  const [snapshot, setSnapshot] = useState(EMPTY_VIEWER_PACK_SNAPSHOT);

  const refresh = useCallback(async () => {
    const bridge = window.puppyoneDesktop?.viewerPacks;
    if (!bridge?.getSnapshot) {
      setSnapshot(EMPTY_VIEWER_PACK_SNAPSHOT);
      return;
    }
    try {
      setSnapshot(await bridge.getSnapshot() ?? EMPTY_VIEWER_PACK_SNAPSHOT);
    } catch {
      setSnapshot(EMPTY_VIEWER_PACK_SNAPSHOT);
    }
  }, []);

  useEffect(() => {
    if (!hostAvailable) {
      setSnapshot(EMPTY_VIEWER_PACK_SNAPSHOT);
      return;
    }
    void refresh();
  }, [hostAvailable, refresh, workspaceKey]);

  const renderSurface = useCallback<NonNullable<ViewerExtensionHostAdapter["renderSurface"]>>(
    ({ document, contribution }) => {
      if (cloudWorkspace || !workspacePath) {
        return (
          <div className="viewer-pack-surface-status viewer-pack-surface-status--error">
            {t("workspace.viewerPack.rootUnavailable")}
          </div>
        );
      }
      return (
        <Suspense fallback={<div className="viewer-pack-surface-status">{t("workspace.viewerPack.loadingExtension")}</div>}>
          <LazyDesktopViewerPackSurface
            document={document}
            contribution={contribution}
            workspaceRoot={workspacePath}
            onInstalled={refresh}
          />
        </Suspense>
      );
    },
    [cloudWorkspace, refresh, t, workspacePath],
  );
  const renderInstallFallback = useCallback<NonNullable<ViewerExtensionHostAdapter["renderInstallFallback"]>>(
    ({ document }) => (
      <Suspense fallback={<div className="viewer-pack-surface-status">{t("workspace.viewerPack.loadingOptions")}</div>}>
        <LazyDesktopViewerPackFallback
          document={{
            path: document.path,
            name: document.name,
            type: "file",
            mimeType: document.mimeType ?? null,
            sourceKind: "local",
          }}
          onInstalled={refresh}
        />
      </Suspense>
    ),
    [refresh, t],
  );
  const adapter = useMemo<ViewerExtensionHostAdapter | null>(() => (
    hostAvailable
      ? { snapshot, renderSurface, renderInstallFallback }
      : null
  ), [hostAvailable, renderInstallFallback, renderSurface, snapshot]);

  return { adapter, hostAvailable, refresh, snapshot } as const;
}
