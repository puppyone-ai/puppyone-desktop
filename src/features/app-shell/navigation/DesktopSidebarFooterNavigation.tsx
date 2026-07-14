import { DesktopNavigationItems, DesktopSidebarSettingsButton } from "./DesktopNavigationItems";
import { DesktopWorkspaceSurfaceActionButton } from "./DesktopWorkspaceSurfaceActionButton";
import { resolveNavigationItems } from "./navigationModel";
import type { DesktopNavigationProps, DesktopWorkspaceSurfaceAction } from "./types";

export function DesktopSidebarFooterNavigation({
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
    <div
      className="desktop-sidebar-footer-bar desktop-sidebar-navigation-surface actions-only horizontal"
      data-placement="bottom"
      data-orientation="horizontal"
    >
      <div className="desktop-sidebar-footer-actions desktop-sidebar-footer-actions-left">
        <DesktopNavigationItems {...runtime} buttonClassName="desktop-sidebar-footer-button" items={localItems} />
        {cloudItems.length > 0 && (
          <DesktopNavigationItems {...runtime} buttonClassName="desktop-sidebar-footer-button" items={cloudItems} />
        )}
        {surfaceAction && <DesktopWorkspaceSurfaceActionButton action={surfaceAction} />}
        <DesktopSidebarSettingsButton
          activeView={activeView}
          buttonClassName="desktop-sidebar-footer-button"
          onOpenSettings={onOpenSettings}
        />
        {cloudHubItems.length > 0 && (
          <DesktopNavigationItems {...runtime} buttonClassName="desktop-sidebar-footer-button" items={cloudHubItems} />
        )}
      </div>
    </div>
  );
}
