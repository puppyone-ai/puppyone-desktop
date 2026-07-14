import { Fragment } from "react";
import { MessageSquare } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import {
  DesktopUpdateTitlebarButton,
  type useDesktopUpdates,
} from "../../components/DesktopUpdateControls";
import { getOrderedHeaderElementDefinitions, type HeaderElementRenderContext } from "./headerElements";
import type { TitlebarActionsSettings } from "../../preferences";

type DesktopUpdatesController = ReturnType<typeof useDesktopUpdates>;

type DesktopTitlebarActionsProps = {
  desktopUpdates: DesktopUpdatesController;
  activeFileExternalOpenTitle?: string;
  activeFileExternalOpenAppName?: string | null;
  activeFileExternalOpenIconDataUrl?: string | null;
  activeFileExternalOpenLoading?: boolean;
  canOpenActiveFileExternal: boolean;
  titlebarActionsSettings: TitlebarActionsSettings;
  terminalSidebarOpen: boolean;
  terminalToolEnabled: boolean;
  agentChatEnabled: boolean;
  agentChatSidebarOpen: boolean;
  onOpenActiveFileExternal: () => void;
  onToggleAgentChat: () => void;
  onToggleTerminal: () => void;
  onUpdateNow: () => void;
};

export function DesktopTitlebarActions({
  desktopUpdates,
  activeFileExternalOpenTitle,
  activeFileExternalOpenAppName,
  activeFileExternalOpenIconDataUrl,
  activeFileExternalOpenLoading = false,
  canOpenActiveFileExternal,
  titlebarActionsSettings,
  terminalSidebarOpen,
  terminalToolEnabled,
  agentChatEnabled,
  agentChatSidebarOpen,
  onOpenActiveFileExternal,
  onToggleAgentChat,
  onToggleTerminal,
  onUpdateNow,
}: DesktopTitlebarActionsProps) {
  const { t } = useLocalization();

  const headerElementContext: HeaderElementRenderContext = {
    t,
    externalOpen: {
      appName: activeFileExternalOpenAppName,
      canOpen: canOpenActiveFileExternal,
      iconDataUrl: activeFileExternalOpenIconDataUrl,
      loading: activeFileExternalOpenLoading,
      onOpen: onOpenActiveFileExternal,
      title: activeFileExternalOpenTitle,
    },
    terminal: {
      enabled: terminalToolEnabled,
      onToggle: onToggleTerminal,
      sidebarOpen: terminalSidebarOpen,
    },
  };

  return (
    <>
      <DesktopUpdateTitlebarButton
        state={desktopUpdates.state}
        onUpdateNow={onUpdateNow}
      />
      {getOrderedHeaderElementDefinitions(titlebarActionsSettings.order).map((definition) => {
        if (!titlebarActionsSettings.enabled[definition.id]) return null;
        if (!definition.isAvailable(headerElementContext)) return null;
        return (
          <Fragment key={definition.id}>
            {definition.render(headerElementContext)}
          </Fragment>
        );
      })}
      <AgentChatTitlebarButton
        enabled={agentChatEnabled}
        open={agentChatSidebarOpen}
        onToggle={onToggleAgentChat}
      />
    </>
  );
}

export function AgentChatTitlebarButton({
  enabled,
  open,
  onToggle,
}: {
  enabled: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useLocalization();
  if (!enabled) return null;
  const label = t(open ? "shell.titlebar.hideAgentChat" : "shell.titlebar.showAgentChat");
  return (
    <button
      className="desktop-titlebar-action desktop-titlebar-agent-chat"
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={open}
      onClick={onToggle}
    >
      <MessageSquare size={15} strokeWidth={1.8} />
    </button>
  );
}
