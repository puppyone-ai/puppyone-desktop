import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, MessageSquare, MoreHorizontal, Plus, SquareTerminal, Trash2 } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import { resolveRendererPublicAssetUrl } from "@puppyone/shared-ui";
import {
  DesktopMenuIconButton,
  DesktopMenuItem,
  DesktopMenuSeparator,
  DesktopMenuSurface,
} from "../../components/DesktopMenu";
import { getOrderedHeaderElementDefinitions, type HeaderElementRenderContext } from "./headerElements";
import type { TerminalSessionLayout, TitlebarActionsSettings } from "../../preferences";
import type { DesktopUpdateState } from "../../types/electron";
import {
  DesktopUpdateTitlebarButton,
  getDesktopUpdateTitlebarState,
  normalizeDesktopUpdateState,
} from "../updates";

type TerminalTitlebarSession = {
  id: string;
  ordinal: number;
  shell: string | null;
  status: "selecting" | "starting" | "running" | "exited" | "error";
};

const terminalStatusMessageKey = {
  selecting: "terminal.launcher.title",
  starting: "terminal.status.starting",
  running: "terminal.status.running",
  exited: "terminal.status.exited",
  error: "terminal.status.error",
} as const;

type DesktopTitlebarActionsProps = {
  desktopUpdateState?: DesktopUpdateState | null;
  titlebarActionsSettings: TitlebarActionsSettings;
  terminalSidebarOpen: boolean;
  terminalToolEnabled: boolean;
  terminalSessionLayout: TerminalSessionLayout;
  terminalSessions: TerminalTitlebarSession[];
  activeTerminalSessionId: string | null;
  agentChatEnabled: boolean;
  agentChatSidebarOpen: boolean;
  onUpdateNow?: () => void;
  onCreateTerminal: () => void;
  onActivateTerminal: (sessionId: string) => void;
  onCloseTerminal: (sessionId: string) => void;
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
  terminalSessionLayout,
  terminalSessions,
  activeTerminalSessionId,
  agentChatEnabled,
  agentChatSidebarOpen,
  onUpdateNow = () => {},
  onCreateTerminal,
  onActivateTerminal,
  onCloseTerminal,
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
            placement={placement}
          />
        ),
      });
    }
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
        ...titlebarActionItems.filter((item) => item.id !== "terminal" && item.id !== "terminal-menu"),
        ...titlebarActionItems.filter((item) => item.id === "terminal" || item.id === "terminal-menu"),
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

function TerminalTitlebarMenu({
  sessions,
  activeSessionId,
  onActivate,
  onClose,
  onCreate,
  placement,
}: {
  sessions: TerminalTitlebarSession[];
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onCreate: () => void;
  placement: "titlebar" | "toolbar";
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
    <div
      className={placement === "toolbar"
        ? "desktop-shell-toolbar-menu-wrap"
        : "desktop-titlebar-terminal-menu-wrap"}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className={placement === "toolbar"
          ? "desktop-shell-toolbar-menu-trigger"
          : "desktop-titlebar-action desktop-titlebar-terminal-menu-trigger"}
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
          <div
            className="desktop-titlebar-terminal-session-list"
            data-po-scrollbar="menu"
            role="none"
          >
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
