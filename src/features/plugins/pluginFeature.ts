import type {
  ExperimentalSettings,
  SidebarNavigationVisibilitySettings,
} from "../../preferences";

export function isViewerPluginsEnabled({
  settings,
}: {
  settings: ExperimentalSettings;
}) {
  return settings.enableViewerPlugins;
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
