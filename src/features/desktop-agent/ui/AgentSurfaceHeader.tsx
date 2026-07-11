import { useEffect, useRef, useState } from "react";
import { Archive, ChevronDown, CircleAlert, CopyPlus, History, Plus, RotateCcw, Trash2 } from "lucide-react";
import { DesktopMenuItem, DesktopMenuSeparator, DesktopMenuSurface } from "../../../components/DesktopMenu";
import type { AgentSessionListItem } from "../domain/agent-contract";

type AgentSurfaceHeaderProps = {
  title: string;
  runtimeLabel?: string;
  statusLabel: string;
  loading: boolean;
  newSessionDisabled: boolean;
  onNewSession: () => void;
  diagnostic?: string | null;
  closeDisabled?: boolean;
  onCloseSession?: () => void;
  onResetSession?: () => void;
  history?: AgentSessionListItem[];
  activeSessionId?: string | null;
  onSelectSession?: (sessionId: string) => void;
  onForkSession?: () => void;
  onArchiveSession?: () => void;
  onDeleteSession?: () => void;
  onCompactSession?: () => void;
  canFork?: boolean;
  canCompact?: boolean;
};

export function AgentSurfaceHeader({
  title,
  runtimeLabel = "Agent",
  statusLabel,
  loading,
  newSessionDisabled,
  onNewSession,
  diagnostic,
  closeDisabled = false,
  onCloseSession,
  onResetSession,
  history = [],
  activeSessionId,
  onSelectSession,
  onForkSession,
  onArchiveSession,
  onDeleteSession,
  onCompactSession,
  canFork = false,
  canCompact = false,
}: AgentSurfaceHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !historyOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && menuRef.current?.contains(target)) return;
      setMenuOpen(false);
      setHistoryOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); setHistoryOpen(false); }
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [historyOpen, menuOpen]);

  return (
    <header className="desktop-agent-session-header">
      <div className="desktop-agent-session-heading">
        <strong title={title}>{title}</strong>
        <span><i className={`is-${statusLabel.replace(/\s+/g, "-")}`} />{statusLabel}</span>
      </div>
      <div className="desktop-agent-session-header-actions" ref={menuRef}>
        <button type="button" className="desktop-agent-icon-button" aria-label="Session history" title="Session history" aria-expanded={historyOpen} disabled={loading || newSessionDisabled} onClick={() => { setHistoryOpen((value) => !value); setMenuOpen(false); }}><History size={15} /></button>
        <button type="button" className="desktop-agent-icon-button" aria-label={`New ${runtimeLabel} session`} title={`New ${runtimeLabel} session`} disabled={loading || newSessionDisabled} onClick={onNewSession}><Plus size={15} /></button>
        <button type="button" className="desktop-agent-icon-button" aria-label={`${runtimeLabel} session actions`} title="Session actions" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => { setMenuOpen((value) => !value); setHistoryOpen(false); }}><ChevronDown size={14} /></button>
        {historyOpen && (
          <div className="desktop-agent-history-menu" role="menu" aria-label="Agent session history">
            <header><strong>Recent chats</strong><span>{history.length}</span></header>
            {history.length === 0 ? <p>No saved chats yet.</p> : history.map((session) => (
              <button type="button" role="menuitem" className={session.id === activeSessionId ? "is-active" : ""} key={session.id} onClick={() => { setHistoryOpen(false); onSelectSession?.(session.id); }}>
                <strong>{session.title}</strong><span>{session.runtime?.displayName || session.runtimeId || session.provider}</span><time>{relativeTime(session.updatedAt)}</time>
              </button>
            ))}
          </div>
        )}
        {menuOpen && (
          <DesktopMenuSurface ariaLabel={`${runtimeLabel} session actions`} className="desktop-menu-surface desktop-agent-session-menu">
            <DesktopMenuItem icon={<CircleAlert size={15} />} label="Diagnostics" detail={diagnostic || "No diagnostics reported."} disabled />
            <DesktopMenuSeparator />
            {canFork && onForkSession && <DesktopMenuItem icon={<CopyPlus size={15} />} label="Fork chat" disabled={loading || newSessionDisabled} onClick={() => { setMenuOpen(false); onForkSession(); }} />}
            {canCompact && onCompactSession && <DesktopMenuItem icon={<RotateCcw size={15} />} label="Compact context" disabled={loading || newSessionDisabled} onClick={() => { setMenuOpen(false); onCompactSession(); }} />}
            {onResetSession && <DesktopMenuItem icon={<Plus size={15} />} label="New chat" disabled={loading || newSessionDisabled} onClick={() => { setMenuOpen(false); onResetSession(); }} />}
            {onArchiveSession && <DesktopMenuItem icon={<Archive size={15} />} label="Archive chat" disabled={loading || closeDisabled} onClick={() => { setMenuOpen(false); onArchiveSession(); }} />}
            {onDeleteSession && <DesktopMenuItem icon={<Trash2 size={15} />} label="Delete local chat" destructive disabled={loading || closeDisabled} onClick={() => { setMenuOpen(false); onDeleteSession(); }} />}
            {onCloseSession && <DesktopMenuItem icon={<RotateCcw size={15} />} label="Close active connection" disabled={loading || closeDisabled} onClick={() => { setMenuOpen(false); onCloseSession(); }} />}
          </DesktopMenuSurface>
        )}
      </div>
    </header>
  );
}

function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta) || delta < 60_000) return "now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return `${Math.floor(delta / 86_400_000)}d`;
}
