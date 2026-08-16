import type { ReactNode } from "react";
import { Terminal, type LucideIcon } from "lucide-react";
import type { RightSidebarToolId, TitlebarActionId } from "../../preferences";
import type { MessageFormatter } from "@puppyone/localization";

export type HeaderElementDefinition = {
  id: TitlebarActionId;
  label: string;
  icon: LucideIcon;
  linkedRightSidebarToolId?: RightSidebarToolId;
  isAvailable: (context: HeaderElementRenderContext) => boolean;
  render: (context: HeaderElementRenderContext) => ReactNode;
};

export type HeaderElementRenderContext = {
  t: MessageFormatter;
  terminal: {
    enabled: boolean;
    onToggle: () => void;
    sidebarOpen: boolean;
  };
};

export const HEADER_ELEMENT_DEFINITIONS: readonly HeaderElementDefinition[] = [
  {
    id: "terminal",
    label: "Terminal",
    icon: Terminal,
    linkedRightSidebarToolId: "terminal",
    isAvailable: (context) => context.terminal.enabled,
    render: (context) => {
      const terminal = context.terminal;
      const toggleLabel = context.t(terminal.sidebarOpen ? "shell.titlebar.hideTerminal" : "shell.titlebar.showTerminal");
      return (
        <button
          className="desktop-titlebar-action desktop-titlebar-terminal"
          type="button"
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-pressed={terminal.sidebarOpen}
          onClick={terminal.onToggle}
        >
          <Terminal size={15} strokeWidth={1.8} />
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
