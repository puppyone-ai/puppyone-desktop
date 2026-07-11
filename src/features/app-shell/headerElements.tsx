import type { Dispatch, ReactNode, Ref, SetStateAction } from "react";
import { ChevronDown, ExternalLink, Settings, SquareTerminal, type LucideIcon } from "lucide-react";
import { DesktopMenuItem, DesktopMenuSeparator, DesktopMenuSurface } from "../../components/DesktopMenu";
import { ExternalAppIcon } from "../external-apps/ExternalAppIcon";
import type { RightSidebarToolId, TitlebarActionId } from "../../preferences";
import type { WorkspaceExternalOpenTarget } from "../../types/electron";

export type HeaderElementDefinition = {
  id: TitlebarActionId;
  label: string;
  icon: LucideIcon;
  linkedRightSidebarToolId?: RightSidebarToolId;
  isAvailable: (context: HeaderElementRenderContext) => boolean;
  render: (context: HeaderElementRenderContext) => ReactNode;
};

export type HeaderElementRenderContext = {
  externalOpen: {
    appName?: string | null;
    canOpen: boolean;
    iconDataUrl?: string | null;
    loading: boolean;
    menuOpen: boolean;
    menuTargets: WorkspaceExternalOpenTarget[];
    onCustomize: () => void;
    onOpen: () => void;
    onOpenWithApp: (appPath: string | null) => void;
    ref: Ref<HTMLDivElement>;
    setMenuOpen: Dispatch<SetStateAction<boolean>>;
    title?: string;
  };
  terminal: {
    enabled: boolean;
    onToggle: () => void;
    sidebarOpen: boolean;
  };
};

export const HEADER_ELEMENT_DEFINITIONS: readonly HeaderElementDefinition[] = [
  {
    id: "external-open",
    label: "Open external",
    icon: ExternalLink,
    isAvailable: (context) => context.externalOpen.canOpen,
    render: (context) => {
      const externalOpen = context.externalOpen;
      return (
        <div className="desktop-titlebar-external-open" ref={externalOpen.ref}>
          <button
            className="desktop-titlebar-action desktop-titlebar-external-open-main"
            type="button"
            title={externalOpen.title ?? "Open with app"}
            aria-label="Open with app"
            onClick={externalOpen.onOpen}
          >
            <ExternalAppIcon
              appName={externalOpen.appName}
              className="desktop-titlebar-external-app-icon"
              iconDataUrl={externalOpen.iconDataUrl}
              loadingClassName="desktop-titlebar-external-app-loader"
              loaderClassName="desktop-titlebar-external-open-loader"
              loading={externalOpen.loading}
            />
          </button>
          <button
            className="desktop-titlebar-action desktop-titlebar-external-open-menu-button"
            type="button"
            title="Open with..."
            aria-label="Open with..."
            aria-expanded={externalOpen.menuOpen}
            aria-haspopup="menu"
            onClick={() => externalOpen.setMenuOpen((open) => !open)}
          >
            <ChevronDown size={12} />
          </button>
          {externalOpen.menuOpen && (
            <DesktopMenuSurface className="desktop-titlebar-menu desktop-branch-menu desktop-titlebar-external-open-menu">
              {externalOpen.menuTargets.map((target, index) => (
                <DesktopMenuItem
                  className="desktop-branch-menu-row desktop-titlebar-external-open-row"
                  key={`${target.appPath ?? "default"}:${index}`}
                  icon={(
                    <ExternalAppIcon
                      appName={target.appName}
                      className="desktop-titlebar-external-app-icon"
                      iconDataUrl={target.iconDataUrl}
                      loadingClassName="desktop-titlebar-external-app-loader"
                      loaderClassName="desktop-titlebar-external-open-loader"
                    />
                  )}
                  label={`${target.appName ?? "macOS Default"}${index === 0 ? " (default)" : ""}`}
                  onClick={() => {
                    externalOpen.setMenuOpen(false);
                    if (index === 0) {
                      externalOpen.onOpen();
                      return;
                    }
                    externalOpen.onOpenWithApp(target.appPath);
                  }}
                />
              ))}
              <DesktopMenuSeparator />
              <DesktopMenuItem
                className="desktop-branch-menu-row desktop-titlebar-external-open-row"
                icon={<Settings size={15} />}
                label="Customize..."
                onClick={() => {
                  externalOpen.setMenuOpen(false);
                  externalOpen.onCustomize();
                }}
              />
            </DesktopMenuSurface>
          )}
        </div>
      );
    },
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: SquareTerminal,
    linkedRightSidebarToolId: "terminal",
    isAvailable: (context) => context.terminal.enabled,
    render: (context) => {
      const terminal = context.terminal;
      const toggleLabel = terminal.sidebarOpen ? "Hide Terminal" : "Show Terminal";
      return (
        <button
          className="desktop-titlebar-action desktop-titlebar-terminal"
          type="button"
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-pressed={terminal.sidebarOpen}
          onClick={terminal.onToggle}
        >
          <SquareTerminal size={16} />
        </button>
      );
    },
  },
] as const;

export function getHeaderElementDefinition(id: TitlebarActionId) {
  return HEADER_ELEMENT_DEFINITIONS.find((definition) => definition.id === id) ?? null;
}

export function getOrderedHeaderElementDefinitions(order: TitlebarActionId[]) {
  return order
    .map(getHeaderElementDefinition)
    .filter((definition): definition is HeaderElementDefinition => Boolean(definition));
}
