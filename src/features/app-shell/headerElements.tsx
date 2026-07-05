import type { Dispatch, ReactNode, Ref, SetStateAction } from "react";
import { ChevronDown, Eraser, ExternalLink, Settings, SquareTerminal, type LucideIcon } from "lucide-react";
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
    onClear: () => void;
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
            <div className="desktop-titlebar-menu desktop-branch-menu desktop-titlebar-external-open-menu" role="menu">
              {externalOpen.menuTargets.map((target, index) => (
                <button
                  className="desktop-branch-menu-row desktop-titlebar-external-open-row"
                  type="button"
                  role="menuitem"
                  key={`${target.appPath ?? "default"}:${index}`}
                  onClick={() => {
                    externalOpen.setMenuOpen(false);
                    if (index === 0) {
                      externalOpen.onOpen();
                      return;
                    }
                    externalOpen.onOpenWithApp(target.appPath);
                  }}
                >
                  <ExternalAppIcon
                    appName={target.appName}
                    className="desktop-titlebar-external-app-icon"
                    iconDataUrl={target.iconDataUrl}
                    loadingClassName="desktop-titlebar-external-app-loader"
                    loaderClassName="desktop-titlebar-external-open-loader"
                  />
                  <span>{target.appName ?? "macOS Default"}{index === 0 ? " (default)" : ""}</span>
                </button>
              ))}
              <div className="desktop-titlebar-menu-separator" aria-hidden="true" />
              <button
                className="desktop-branch-menu-row desktop-titlebar-external-open-row"
                type="button"
                role="menuitem"
                onClick={() => {
                  externalOpen.setMenuOpen(false);
                  externalOpen.onCustomize();
                }}
              >
                <Settings size={15} />
                <span>Customize...</span>
              </button>
            </div>
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
      return (
        <span className="desktop-titlebar-action-cluster">
          {terminal.sidebarOpen && (
            <button
              className="desktop-titlebar-action"
              type="button"
              title="Clear terminal"
              aria-label="Clear terminal"
              onClick={terminal.onClear}
            >
              <Eraser size={15} />
            </button>
          )}
          <button
            className="desktop-titlebar-action"
            type="button"
            title={terminal.sidebarOpen ? "Hide terminal" : "Show terminal"}
            aria-label={terminal.sidebarOpen ? "Hide terminal" : "Show terminal"}
            aria-pressed={terminal.sidebarOpen}
            onClick={terminal.onToggle}
          >
            <SquareTerminal size={16} />
          </button>
        </span>
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
