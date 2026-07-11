import { Blocks, Compass, PackageCheck } from "lucide-react";
import { OFFICIAL_VIEWER_CATALOG } from "./pluginCatalog";

export type PluginsSection = "installed" | "discover" | "included";
export const DEFAULT_PLUGINS_SECTION: PluginsSection = "installed";

export const PLUGINS_SIDEBAR_ITEMS = [
  { id: "installed", label: "Installed", icon: PackageCheck },
  { id: "discover", label: "Discover", icon: Compass },
  { id: "included", label: "Included", icon: Blocks },
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
  return (
    <section className="desktop-tool-sidebar desktop-plugins-sidebar">
      <div className="desktop-tool-sidebar-list desktop-plugins-sidebar-list">
        <header className="desktop-plugins-sidebar-heading">Plugins</header>
        <nav aria-label="Plugin sections">
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
                <span>{item.label}</span>
                {count > 0 && <small aria-hidden="true">{count}</small>}
              </button>
            );
          })}
        </nav>
      </div>
    </section>
  );
}
