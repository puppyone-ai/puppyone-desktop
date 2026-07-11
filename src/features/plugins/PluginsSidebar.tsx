import { Blocks, Box, ShieldCheck } from "lucide-react";

export type PluginsSection = "discover" | "installed" | "built-in";

export function PluginsSidebar({
  activeSection,
  installedCount,
  onSelectSection,
}: {
  activeSection: PluginsSection;
  installedCount: number;
  onSelectSection: (section: PluginsSection) => void;
}) {
  const items = [
    { id: "discover", label: "Discover", icon: Blocks },
    { id: "installed", label: "Installed", icon: Box, count: installedCount },
    { id: "built-in", label: "Built-in", icon: ShieldCheck },
  ] as const;

  return (
    <section className="desktop-tool-sidebar desktop-plugins-sidebar">
      <div className="desktop-tool-sidebar-list desktop-plugins-sidebar-list">
        <div className="desktop-plugins-sidebar-eyebrow">Plugins</div>
        <nav aria-label="Plugin sections">
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
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
                {"count" in item && item.count > 0 && (
                  <small aria-label={`${item.count} installed plugins`}>{item.count}</small>
                )}
              </button>
            );
          })}
        </nav>
        <div className="desktop-plugins-sidebar-note">
          <ShieldCheck size={14} aria-hidden="true" />
          <span>Local-only viewers</span>
        </div>
      </div>
    </section>
  );
}
