import { useLocalization } from "@puppyone/localization";
import { DesktopNavigationItems, DesktopSidebarSettingsButton } from "./DesktopNavigationItems";
import { DesktopWorkspaceSurfaceActionButton } from "./DesktopWorkspaceSurfaceActionButton";
import { resolveNavigationItems } from "./navigationModel";
import type { DesktopNavigationProps, DesktopWorkspaceSurfaceAction } from "./types";

export function DesktopSidebarRailNavigation({
  activeView,
  availableSurfaceIds,
  cloudHistoryEnabled = false,
  cloudHubEnabled = false,
  cloudToolsEnabled = false,
  gitEnabled = true,
  pluginsEnabled = false,
  gitIncomingCount,
  gitOperationLoading,
  gitStatus,
  workspaceChangeCount,
  surfaceAction,
  onNavigate,
  onOpenSettings,
}: DesktopNavigationProps & { surfaceAction?: DesktopWorkspaceSurfaceAction | null }) {
  const { t } = useLocalization();
  const { cloudHubItems, cloudItems, localItems } = resolveNavigationItems({
    availableSurfaceIds,
    cloudHistoryEnabled,
    cloudHubEnabled,
    cloudToolsEnabled,
    gitEnabled,
    pluginsEnabled,
  });
  const runtime = {
    activeView,
    gitIncomingCount,
    gitOperationLoading,
    gitStatus,
    workspaceChangeCount,
    onNavigate,
  };

  return (
    <div className="desktop-sidebar-rail-navigation" aria-label={t("shell.navigation.ariaLabel")}>
      <div className="desktop-sidebar-rail-actions">
        <DesktopNavigationItems {...runtime} buttonClassName="desktop-sidebar-rail-button" items={localItems} />
        {cloudItems.length > 0 && (
          <DesktopNavigationItems {...runtime} buttonClassName="desktop-sidebar-rail-button" items={cloudItems} />
        )}
      </div>
      <div className="desktop-sidebar-rail-actions desktop-sidebar-rail-actions-end">
        {surfaceAction && (
          <DesktopWorkspaceSurfaceActionButton action={surfaceAction} buttonClassName="desktop-sidebar-rail-button" />
        )}
        <DesktopSidebarSettingsButton
          activeView={activeView}
          buttonClassName="desktop-sidebar-rail-button"
          onOpenSettings={onOpenSettings}
        />
        {cloudHubItems.length > 0 && (
          <DesktopNavigationItems {...runtime} buttonClassName="desktop-sidebar-rail-button" items={cloudHubItems} />
        )}
      </div>
    </div>
  );
}
