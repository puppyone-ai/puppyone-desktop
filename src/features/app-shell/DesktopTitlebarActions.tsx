import { Fragment, useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import {
  DesktopUpdateTitlebarButton,
  type useDesktopUpdates,
} from "../../components/DesktopUpdateControls";
import { getOrderedHeaderElementDefinitions, type HeaderElementRenderContext } from "./headerElements";
import type { TitlebarActionsSettings } from "../../preferences";
import type { WorkspaceExternalOpenTarget } from "../../types/electron";

type DesktopUpdatesController = ReturnType<typeof useDesktopUpdates>;

type DesktopTitlebarActionsProps = {
  desktopUpdates: DesktopUpdatesController;
  activeFileExternalOpenTitle?: string;
  activeFileExternalOpenAppName?: string | null;
  activeFileExternalOpenIconDataUrl?: string | null;
  activeFileExternalOpenLoading?: boolean;
  externalOpenTargets: WorkspaceExternalOpenTarget[];
  canOpenActiveFileExternal: boolean;
  titlebarActionsSettings: TitlebarActionsSettings;
  terminalSidebarOpen: boolean;
  terminalToolEnabled: boolean;
  agentChatEnabled: boolean;
  agentChatSidebarOpen: boolean;
  onOpenActiveFileExternal: () => void;
  onOpenActiveFileWithApp: (appPath: string | null) => void;
  onCustomizeExternalAppForActiveFile: () => void;
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
  externalOpenTargets,
  canOpenActiveFileExternal,
  titlebarActionsSettings,
  terminalSidebarOpen,
  terminalToolEnabled,
  agentChatEnabled,
  agentChatSidebarOpen,
  onOpenActiveFileExternal,
  onOpenActiveFileWithApp,
  onCustomizeExternalAppForActiveFile,
  onToggleAgentChat,
  onToggleTerminal,
  onUpdateNow,
}: DesktopTitlebarActionsProps) {
  const externalOpenRef = useRef<HTMLDivElement>(null);
  const [externalOpenMenuOpen, setExternalOpenMenuOpen] = useState(false);
  const defaultTarget = externalOpenTargets[0] ?? null;
  const menuTargets = externalOpenTargets.length > 0 ? externalOpenTargets : [defaultTarget].filter(Boolean);

  useEffect(() => {
    if (!externalOpenMenuOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && externalOpenRef.current?.contains(target)) return;
      setExternalOpenMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExternalOpenMenuOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [externalOpenMenuOpen]);

  useEffect(() => {
    if (!canOpenActiveFileExternal) setExternalOpenMenuOpen(false);
  }, [canOpenActiveFileExternal]);

  const headerElementContext: HeaderElementRenderContext = {
    externalOpen: {
      appName: activeFileExternalOpenAppName,
      canOpen: canOpenActiveFileExternal,
      iconDataUrl: activeFileExternalOpenIconDataUrl,
      loading: activeFileExternalOpenLoading,
      menuOpen: externalOpenMenuOpen,
      menuTargets,
      onCustomize: onCustomizeExternalAppForActiveFile,
      onOpen: onOpenActiveFileExternal,
      onOpenWithApp: onOpenActiveFileWithApp,
      ref: externalOpenRef,
      setMenuOpen: setExternalOpenMenuOpen,
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
  if (!enabled) return null;
  const label = open ? "Hide Agent Chat" : "Show Agent Chat";
  return (
    <button
      className="desktop-titlebar-action desktop-titlebar-agent-chat"
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={open}
      onClick={onToggle}
    >
      <MessageSquare size={16} />
    </button>
  );
}
