import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { MessageSquare, MoreHorizontal, Plus, SquareTerminal, Trash2 } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import {
  DesktopMenuIconButton,
  DesktopMenuItem,
  DesktopMenuSeparator,
  DesktopMenuSurface,
} from "../../components/DesktopMenu";
import { getOrderedHeaderElementDefinitions, type HeaderElementRenderContext } from "./headerElements";
import type { TerminalSessionLayout, TitlebarActionsSettings } from "../../preferences";

type TerminalTitlebarSession = {
  id: string;
  ordinal: number;
  shell: string | null;
  status: "starting" | "running" | "exited" | "error";
};

const terminalStatusMessageKey = {
  starting: "terminal.status.starting",
  running: "terminal.status.running",
  exited: "terminal.status.exited",
  error: "terminal.status.error",
} as const;

type DesktopTitlebarActionsProps = {
  activeFileExternalOpenTitle?: string;
  activeFileExternalOpenAppName?: string | null;
  activeFileExternalOpenIconDataUrl?: string | null;
  activeFileExternalOpenLoading?: boolean;
  canOpenActiveFileExternal: boolean;
  titlebarActionsSettings: TitlebarActionsSettings;
  terminalSidebarOpen: boolean;
  terminalToolEnabled: boolean;
  terminalSessionLayout: TerminalSessionLayout;
  terminalSessions: TerminalTitlebarSession[];
  activeTerminalSessionId: string | null;
  agentChatEnabled: boolean;
  agentChatSidebarOpen: boolean;
  onOpenActiveFileExternal: () => void;
  onCreateTerminal: () => void;
  onActivateTerminal: (sessionId: string) => void;
  onCloseTerminal: (sessionId: string) => void;
  onToggleAgentChat: () => void;
  onToggleTerminal: () => void;
};

export function DesktopTitlebarActions({
  activeFileExternalOpenTitle,
  activeFileExternalOpenAppName,
  activeFileExternalOpenIconDataUrl,
  activeFileExternalOpenLoading = false,
  canOpenActiveFileExternal,
  titlebarActionsSettings,
  terminalSidebarOpen,
  terminalToolEnabled,
  terminalSessionLayout,
  terminalSessions,
  activeTerminalSessionId,
  agentChatEnabled,
  agentChatSidebarOpen,
  onOpenActiveFileExternal,
  onCreateTerminal,
  onActivateTerminal,
  onCloseTerminal,
  onToggleAgentChat,
  onToggleTerminal,
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

  const titlebarActionItems: Array<{
    group: "header" | "right-sidebar";
    id: string;
    node: ReactNode;
  }> = [];

  for (const definition of getOrderedHeaderElementDefinitions(titlebarActionsSettings.order)) {
    if (
      !titlebarActionsSettings.enabled[definition.id]
      || !definition.isAvailable(headerElementContext)
    ) {
      continue;
    }

    const group = definition.linkedRightSidebarToolId ? "right-sidebar" as const : "header" as const;
    const element = definition.render(headerElementContext);

    // Separate sibling buttons — do not wrap in a shared cluster chrome.
    if (
      definition.id === "terminal"
      && terminalSidebarOpen
      && terminalSessionLayout === "menu"
    ) {
      titlebarActionItems.push({
        group,
        id: "terminal-menu",
        node: (
          <TerminalTitlebarMenu
            sessions={terminalSessions}
            activeSessionId={activeTerminalSessionId}
            onActivate={onActivateTerminal}
            onClose={onCloseTerminal}
            onCreate={onCreateTerminal}
          />
        ),
      });
    }

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
        />
      ),
    });
  }

  return (
    <>
      {titlebarActionItems.map((item, index) => {
        const previousItem = titlebarActionItems[index - 1];
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

function TerminalTitlebarMenu({
  sessions,
  activeSessionId,
  onActivate,
  onClose,
  onCreate,
}: {
  sessions: TerminalTitlebarSession[];
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onCreate: () => void;
}) {
  const { t } = useLocalization();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && rootRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [menuOpen]);

  const runAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className="desktop-titlebar-terminal-menu-wrap" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="desktop-titlebar-action desktop-titlebar-terminal-menu-trigger"
        title={t("terminal.actions")}
        aria-label={t("terminal.actions")}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <MoreHorizontal size={14} />
      </button>
      {menuOpen && (
        <DesktopMenuSurface
          ariaLabel={t("terminal.actions")}
          className="desktop-titlebar-menu desktop-titlebar-terminal-menu"
        >
          <DesktopMenuItem
            icon={<Plus size={13} strokeWidth={1.9} />}
            label={t("terminal.new")}
            onClick={() => runAction(onCreate)}
          />
          {sessions.length > 0 && <DesktopMenuSeparator />}
          <div className="desktop-titlebar-terminal-session-list" role="none">
            {sessions.length === 0 ? (
              <DesktopMenuItem
                disabled
                label={t("terminal.empty")}
              />
            ) : sessions.map((session) => {
              const title = t("terminal.sessionTitle", { number: session.ordinal });
              const status = t(terminalStatusMessageKey[session.status]);
              const visibleLabel = session.shell || status;
              const accessibleLabel = session.shell
                ? `${title} — ${session.shell} — ${status}`
                : `${title} — ${status}`;
              const active = activeSessionId === session.id;
              return (
                <div
                  className={`desktop-titlebar-terminal-session-row ${active ? "is-active" : ""}`}
                  role="none"
                  key={session.id}
                >
                  <DesktopMenuItem
                    className="desktop-titlebar-terminal-session-select"
                    detail={session.shell ? status : undefined}
                    icon={<SquareTerminal size={13} strokeWidth={1.8} />}
                    label={visibleLabel}
                    role="menuitemradio"
                    aria-label={accessibleLabel}
                    aria-checked={active}
                    selected={active}
                    onClick={() => runAction(() => onActivate(session.id))}
                  />
                  <DesktopMenuIconButton
                    role="menuitem"
                    className="desktop-titlebar-terminal-session-close"
                    label={t("terminal.closeSession", { title })}
                    icon={<Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />}
                    onClick={(event) => {
                      event.stopPropagation();
                      runAction(() => onClose(session.id));
                    }}
                  />
                </div>
              );
            })}
          </div>
        </DesktopMenuSurface>
      )}
    </div>
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
