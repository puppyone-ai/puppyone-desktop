import { Blocks, Compass, PackageCheck } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import { SidebarRoot, SidebarRow, SidebarScrollArea } from "@puppyone/shared-ui";
import { OFFICIAL_VIEWER_CATALOG } from "./pluginCatalog";

export type PluginsSection = "installed" | "discover" | "included";
export const DEFAULT_PLUGINS_SECTION: PluginsSection = "installed";

export const PLUGINS_SIDEBAR_ITEMS = [
  { id: "installed", icon: PackageCheck },
  { id: "discover", icon: Compass },
  { id: "included", icon: Blocks },
] as const;

export function PluginsSidebar({
  activeSection,
  installedCount,
  onSelectSection,
}: {
  activeSection: PluginsSection;
  installedCount: number;
  onSelectSection: (section: PluginsSection) => void;
}) {
  const { t } = useLocalization();
  return (
    <SidebarRoot className="desktop-plugins-sidebar">
      <SidebarScrollArea className="desktop-plugins-sidebar-list">
        <header className="desktop-plugins-sidebar-heading">{t("plugins.title")}</header>
        <nav aria-label={t("plugins.sections")}>
          {PLUGINS_SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            const count = item.id === "installed"
              ? installedCount
              : item.id === "included"
                ? OFFICIAL_VIEWER_CATALOG.length
                : 0;
            return (
              <SidebarRow
                key={item.id}
                className="desktop-plugins-sidebar-row"
                active={active}
                aria-current={active ? "page" : undefined}
                onClick={() => onSelectSection(item.id)}
                icon={<Icon size={15} strokeWidth={1.9} />}
                label={t(`plugins.section.${item.id}`)}
                meta={count > 0 ? <small aria-hidden="true">{count}</small> : undefined}
              />
            );
          })}
        </nav>
      </SidebarScrollArea>
    </SidebarRoot>
  );
}
