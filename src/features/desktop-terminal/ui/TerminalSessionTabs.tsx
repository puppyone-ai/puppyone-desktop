import {
  useLayoutEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { AtSign, Plus, X } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import { DesktopMenuIconButton } from "../../../components/DesktopMenu";
import type { DesktopTerminalSessionSummary } from "../model/terminalSessions";
import type { TerminalRuntimeHandle } from "../runtime/terminalRuntime";
import type { TerminalRuntimeRegistry } from "../runtime/terminalRuntimeRegistry";
import { readTerminalActivitySpinnerFrame } from "../runtime/terminalTitleActivity";

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
  runtimeRegistry?: Pick<TerminalRuntimeRegistry, "require">;
};

export function TerminalSessionTabs({
  sessions,
  activeSessionId,
  onActivate,
  onClose,
  onCreate,
  runtimeRegistry,
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
        data-po-scrollbar="hidden"
        role="tablist"
        aria-label={t("terminal.title")}
      >
        {sessions.map((session, index) => (
          <TerminalSessionTab
            key={session.id}
            session={session}
            runtime={runtimeRegistry?.require(session.id) ?? null}
            fallbackShell={fallbackShell}
            active={session.id === activeSessionId}
            onActivate={onActivate}
            onClose={onClose}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          />
        ))}
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

type TerminalSessionTabProps = {
  session: DesktopTerminalSessionSummary;
  runtime: TerminalRuntimeHandle | null;
  fallbackShell: string | null;
  active: boolean;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
};

function TerminalSessionTab({
  session,
  runtime,
  fallbackShell,
  active,
  onActivate,
  onClose,
  onKeyDown,
}: TerminalSessionTabProps) {
  const { t } = useLocalization();
  const terminalActivity = useTerminalActivity(runtime);
  const activeActivity = session.status === "running" && terminalActivity;
  const title = t("terminal.sessionTitle", { number: session.ordinal });
  const status = t(terminalStatusMessageKey[session.status]);
  const visibleShell = session.shell || (session.status === "starting" ? fallbackShell : null);
  const visibleLabel = visibleShell || status;
  const accessibleLabel = visibleShell
    ? `${title} — ${visibleShell} — ${status}`
    : `${title} — ${status}`;

  return (
    <div
      className={`desktop-terminal-tab ${active ? "is-active" : ""}`}
      data-status={session.status}
      role="presentation"
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
        onKeyDown={onKeyDown}
      >
        <span
          className={`desktop-terminal-tab-status ${activeActivity ? "is-activity" : ""}`}
          aria-hidden="true"
        >
          {activeActivity ? (
            <span className="desktop-terminal-tab-activity-indicator">
              <span className="desktop-terminal-tab-activity-dot" />
              <span className="desktop-terminal-tab-activity-dot" />
              <span className="desktop-terminal-tab-activity-dot" />
              <span className="desktop-terminal-tab-activity-dot" />
            </span>
          ) : session.status === "running" ? (
            <AtSign
              className="desktop-terminal-tab-idle-mark"
              size={12}
              strokeWidth={1.8}
            />
          ) : null}
        </span>
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
}

function useTerminalActivity(runtime: TerminalRuntimeHandle | null) {
  const [active, setActive] = useState(
    () => readTerminalActivitySpinnerFrame(runtime?.title ?? "") !== null,
  );

  useLayoutEffect(() => {
    return runtime?.subscribeTitle((title) => {
      setActive(readTerminalActivitySpinnerFrame(title) !== null);
    });
  }, [runtime]);

  return active;
}

export function terminalTabId(sessionId: string) {
  return `desktop-terminal-tab-${sessionId}`;
}

export function terminalPanelId(sessionId: string) {
  return `desktop-terminal-panel-${sessionId}`;
}
