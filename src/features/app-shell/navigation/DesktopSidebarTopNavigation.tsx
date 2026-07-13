import { useLocalization } from "@puppyone/localization";
import type { SidebarNavigationOrientation } from "../../../preferences";
import { DesktopNavigationItems, DesktopSidebarSettingsButton } from "./DesktopNavigationItems";
import { resolveNavigationItems } from "./navigationModel";
import type { DesktopNavigationProps } from "./types";

export function DesktopSidebarTopNavigation({
  activeView,
  availableSurfaceIds,
  cloudHistoryEnabled = false,
  cloudHubEnabled = false,
  cloudToolsEnabled = false,
  gitEnabled = true,
  pluginsEnabled = false,
  orientation,
  gitIncomingCount,
  gitOperationLoading,
  gitStatus,
  workspaceChangeCount,
  onNavigate,
  onOpenSettings,
}: DesktopNavigationProps & { orientation: SidebarNavigationOrientation }) {
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
    <div
      className={`desktop-sidebar-top-navigation desktop-sidebar-navigation-surface ${orientation}`}
      data-placement="top"
      data-orientation={orientation}
    >
      <div className="desktop-sidebar-top-navigation-list" aria-label={t("shell.navigation.ariaLabel")}>
        <div className="desktop-sidebar-top-navigation-group desktop-sidebar-top-navigation-local">
          <DesktopNavigationItems
            {...runtime}
            buttonClassName="desktop-sidebar-top-navigation-button"
            items={localItems}
            showLabel
          />
          {cloudItems.length > 0 && (
            <DesktopNavigationItems
              {...runtime}
              buttonClassName="desktop-sidebar-top-navigation-button"
              items={cloudItems}
              showLabel
            />
          )}
          <DesktopSidebarSettingsButton
            activeView={activeView}
            buttonClassName="desktop-sidebar-top-navigation-button"
            onOpenSettings={onOpenSettings}
          />
          {cloudHubItems.length > 0 && (
            <DesktopNavigationItems
              {...runtime}
              buttonClassName="desktop-sidebar-top-navigation-button"
              items={cloudHubItems}
              showLabel
            />
          )}
        </div>
      </div>
    </div>
  );
}
