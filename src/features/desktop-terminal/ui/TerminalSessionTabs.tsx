import { useLayoutEffect, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import { DesktopMenuIconButton } from "../../../components/DesktopMenu";
import type { DesktopTerminalSessionSummary } from "../model/terminalSessions";

const terminalStatusMessageKey = {
  starting: "terminal.status.starting",
  running: "terminal.status.running",
  exited: "terminal.status.exited",
  error: "terminal.status.error",
} as const;

type TerminalSessionTabsProps = {
  sessions: DesktopTerminalSessionSummary[];
  activeSessionId: string | null;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onCreate: () => void;
};

export function TerminalSessionTabs({
  sessions,
  activeSessionId,
  onActivate,
  onClose,
  onCreate,
}: TerminalSessionTabsProps) {
  const { t } = useLocalization();
  const fallbackShell = sessions.find((session) => session.shell)?.shell ?? null;

  useLayoutEffect(() => {
    if (!activeSessionId) return;
    const activeTab = document.getElementById(terminalTabId(activeSessionId));
    if (typeof activeTab?.scrollIntoView !== "function") return;
    activeTab.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
  }, [activeSessionId, sessions.length]);

  const moveToTab = (index: number) => {
    const session = sessions[index];
    if (!session) return;
    onActivate(session.id);
    requestAnimationFrame(() => document.getElementById(terminalTabId(session.id))?.focus());
  };

  const handleTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (sessions.length < 2) return;
    const isRtl = document.documentElement.dir === "rtl";
    let nextIndex: number | null = null;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = sessions.length - 1;
    if (event.key === "ArrowRight") {
      nextIndex = (index + (isRtl ? -1 : 1) + sessions.length) % sessions.length;
    }
    if (event.key === "ArrowLeft") {
      nextIndex = (index + (isRtl ? 1 : -1) + sessions.length) % sessions.length;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    moveToTab(nextIndex);
  };

  return (
    <header className="desktop-terminal-subheader" data-window-no-drag="true">
      <div
        className="desktop-terminal-tabs"
        role="tablist"
        aria-label={t("terminal.title")}
      >
        {sessions.map((session, index) => {
          const title = t("terminal.sessionTitle", { number: session.ordinal });
          const status = t(terminalStatusMessageKey[session.status]);
          const visibleShell = session.shell || (session.status === "starting" ? fallbackShell : null);
          const visibleLabel = visibleShell || status;
          const accessibleLabel = visibleShell
            ? `${title} — ${visibleShell} — ${status}`
            : `${title} — ${status}`;
          const active = session.id === activeSessionId;
          return (
            <div
              className={`desktop-terminal-tab ${active ? "is-active" : ""}`}
              data-status={session.status}
              role="presentation"
              key={session.id}
            >
              <button
                id={terminalTabId(session.id)}
                type="button"
                className="desktop-terminal-tab-select"
                role="tab"
                aria-controls={terminalPanelId(session.id)}
                aria-label={accessibleLabel}
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                title={accessibleLabel}
                onClick={() => onActivate(session.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <span className="desktop-terminal-tab-status" aria-hidden="true" />
                <span className="desktop-terminal-tab-title">{visibleLabel}</span>
              </button>
              <DesktopMenuIconButton
                className="desktop-terminal-tab-close"
                label={t("terminal.closeSession", { title })}
                icon={<X size={12} strokeWidth={1.8} aria-hidden="true" />}
                onClick={() => onClose(session.id)}
              />
            </div>
          );
        })}
      </div>
      <div className="desktop-terminal-subheader-new">
        <DesktopMenuIconButton
          className="desktop-terminal-new-button"
          label={t("terminal.new")}
          icon={<Plus size={14} strokeWidth={1.9} aria-hidden="true" />}
          onClick={onCreate}
        />
      </div>
    </header>
  );
}

export function terminalTabId(sessionId: string) {
  return `desktop-terminal-tab-${sessionId}`;
}

export function terminalPanelId(sessionId: string) {
  return `desktop-terminal-panel-${sessionId}`;
}
