import { Fragment, type ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import { resolveRendererPublicAssetUrl } from "@puppyone/shared-ui";
import { getOrderedHeaderElementDefinitions, type HeaderElementRenderContext } from "./headerElements";
import type { TitlebarActionsSettings } from "../../preferences";
import type { DesktopUpdateState } from "../../types/electron";
import {
  DesktopUpdateTitlebarButton,
  getDesktopUpdateTitlebarState,
  normalizeDesktopUpdateState,
} from "../updates";

type DesktopTitlebarActionsProps = {
  desktopUpdateState?: DesktopUpdateState | null;
  titlebarActionsSettings: TitlebarActionsSettings;
  terminalSidebarOpen: boolean;
  terminalToolEnabled: boolean;
  agentChatEnabled: boolean;
  agentChatSidebarOpen: boolean;
  onUpdateNow?: () => void;
  onToggleAgentChat: () => void;
  onToggleTerminal: () => void;
  placement?: "titlebar" | "toolbar";
  visibleGroups?: readonly DesktopTitlebarActionGroup[];
};

export type DesktopTitlebarActionGroup = "app-status" | "header" | "right-sidebar";

export function DesktopTitlebarActions({
  desktopUpdateState = null,
  titlebarActionsSettings,
  terminalSidebarOpen,
  terminalToolEnabled,
  agentChatEnabled,
  agentChatSidebarOpen,
  onUpdateNow = () => {},
  onToggleAgentChat,
  onToggleTerminal,
  placement = "titlebar",
  visibleGroups,
}: DesktopTitlebarActionsProps) {
  const { t } = useLocalization();

  const headerElementContext: HeaderElementRenderContext = {
    t,
    placement,
    terminal: {
      enabled: terminalToolEnabled,
      onToggle: onToggleTerminal,
      sidebarOpen: terminalSidebarOpen,
    },
  };

  const normalizedUpdateState = normalizeDesktopUpdateState(desktopUpdateState);
  const titlebarActionItems: Array<{
    group: DesktopTitlebarActionGroup;
    id: string;
    node: ReactNode;
  }> = [];

  if (getDesktopUpdateTitlebarState(normalizedUpdateState)) {
    titlebarActionItems.push({
      group: "app-status",
      id: "app-update",
      node: (
        <DesktopUpdateTitlebarButton
          state={normalizedUpdateState}
          onUpdateNow={onUpdateNow}
        />
      ),
    });
  }

  for (const definition of getOrderedHeaderElementDefinitions(titlebarActionsSettings.order)) {
    if (
      !titlebarActionsSettings.enabled[definition.id]
      || !definition.isAvailable(headerElementContext)
    ) {
      continue;
    }

    const group = definition.linkedRightSidebarToolId ? "right-sidebar" as const : "header" as const;
    const element = definition.render(headerElementContext);

    titlebarActionItems.push({
      group,
      id: definition.id,
      node: element,
    });
  }

  if (agentChatEnabled) {
    titlebarActionItems.push({
      group: "right-sidebar",
      id: "agent-chat",
      node: (
        <AgentChatTitlebarButton
          enabled
          open={agentChatSidebarOpen}
          onToggle={onToggleAgentChat}
          placement={placement}
        />
      ),
    });
  }

  const placementOrderedItems = placement === "toolbar"
    ? [
        ...titlebarActionItems.filter((item) => item.id !== "terminal"),
        ...titlebarActionItems.filter((item) => item.id === "terminal"),
      ]
    : titlebarActionItems;
  const visibleTitlebarActionItems = visibleGroups
    ? placementOrderedItems.filter((item) => visibleGroups.includes(item.group))
    : placementOrderedItems;

  return (
    <>
      {visibleTitlebarActionItems.map((item, index) => {
        const previousItem = visibleTitlebarActionItems[index - 1];
        return (
          <Fragment key={item.id}>
            {previousItem && previousItem.group !== item.group && (
              <span className="desktop-titlebar-action-divider" aria-hidden="true" />
            )}
            {item.node}
          </Fragment>
        );
      })}
    </>
  );
}

export function AgentChatTitlebarButton({
  enabled,
  open,
  onToggle,
  placement = "titlebar",
}: {
  enabled: boolean;
  open: boolean;
  onToggle: () => void;
  placement?: "titlebar" | "toolbar";
}) {
  const { t } = useLocalization();
  if (!enabled) return null;
  const label = t(open ? "shell.titlebar.hideAgentChat" : "shell.titlebar.showAgentChat");
  return (
    <button
      className={placement === "toolbar"
        ? "desktop-shell-toolbar-button desktop-shell-toolbar-agent"
        : "desktop-titlebar-action desktop-titlebar-agent-chat"}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={open}
      data-toolbar-action={placement === "toolbar" ? "agent" : undefined}
      onClick={onToggle}
    >
      {placement === "toolbar" ? (
        <i
          className="desktop-shell-toolbar-button-icon"
          aria-hidden="true"
        >
          <img
            className="desktop-shell-toolbar-agent-logo"
            src={resolveRendererPublicAssetUrl("PuppyAgentLOGO.png")}
            alt=""
            draggable={false}
          />
        </i>
      ) : (
        <MessageSquare size={15} strokeWidth={1.8} />
      )}
      {placement === "toolbar" && (
        <span className="desktop-shell-toolbar-button-label">
          {t("shell.navigation.agentChat")}
        </span>
      )}
    </button>
  );
}
