import type {
  ExperimentalSettings,
  SidebarNavigationVisibilitySettings,
} from "../../preferences";

export function isViewerPluginsEnabled({
  settings,
  workspaceIsCloud,
}: {
  settings: ExperimentalSettings;
  workspaceIsCloud: boolean;
}) {
  return settings.enableViewerPlugins && !workspaceIsCloud;
}

export function isPluginsNavigationVisible({
  featureEnabled,
  visibility,
}: {
  featureEnabled: boolean;
  visibility: SidebarNavigationVisibilitySettings;
}) {
  return featureEnabled && visibility.enabled.plugins;
}
