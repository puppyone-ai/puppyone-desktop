"use client";

import { useCallback } from "react";
import type { EditorDocument, ViewerContribution } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";
import { PluginSurfaceController } from "./PluginSurfaceController";
import { ViewerPackInstallCta } from "./ViewerPackInstallCta";

export { PluginSurfaceController } from "./PluginSurfaceController";
export { ViewerPackInstallCta } from "./ViewerPackInstallCta";

export type DesktopViewerPackSurfaceProps = {
  document: EditorDocument;
  contribution: ViewerContribution;
  workspaceRoot: string;
  onInstalled?: () => void | Promise<void>;
};

/**
 * Desktop DI surface for ExternalViewerAdapter. Activates the native pack
 * session for an enabled contribution. Never imports Electron itself.
 */
export function DesktopViewerPackSurface({
  document,
  contribution,
  workspaceRoot,
}: DesktopViewerPackSurfaceProps) {
  return (
    <PluginSurfaceController
      document={document}
      contribution={contribution}
      workspaceRoot={workspaceRoot}
    />
  );
}

export function useDesktopViewerPackSurface(input: {
  workspaceRoot: string | null;
  onInstalled?: () => void | Promise<void>;
}) {
  const { t } = useLocalization();
  return useCallback(
    ({ document, contribution }: { document: EditorDocument; contribution: ViewerContribution }) => {
      if (!input.workspaceRoot) {
        return (
          <div className="viewer-pack-surface-status viewer-pack-surface-status--error">
            {t("workspace.viewerPack.rootUnavailable")}
          </div>
        );
      }
      return (
        <DesktopViewerPackSurface
          document={document}
          contribution={contribution}
          workspaceRoot={input.workspaceRoot}
          onInstalled={input.onInstalled}
        />
      );
    },
    [input.onInstalled, input.workspaceRoot, t],
  );
}

export function DesktopViewerPackFallback({
  document,
  onInstalled,
}: {
  document: EditorDocument;
  onInstalled?: () => void | Promise<void>;
}) {
  return <ViewerPackInstallCta document={document} onInstalled={onInstalled} />;
}
