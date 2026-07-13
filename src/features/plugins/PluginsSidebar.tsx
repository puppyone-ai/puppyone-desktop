import { Blocks, Compass, PackageCheck } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
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
    <section className="desktop-tool-sidebar desktop-plugins-sidebar">
      <div className="desktop-tool-sidebar-list desktop-plugins-sidebar-list">
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
              <button
                key={item.id}
                type="button"
                className={`desktop-tool-sidebar-row desktop-plugins-sidebar-row ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => onSelectSection(item.id)}
              >
                <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
                <span>{t(`plugins.section.${item.id}`)}</span>
                {count > 0 && <small aria-hidden="true">{count}</small>}
              </button>
            );
          })}
        </nav>
      </div>
    </section>
  );
}
