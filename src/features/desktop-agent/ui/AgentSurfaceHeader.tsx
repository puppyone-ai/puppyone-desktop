import { useEffect, useRef, useState, type ReactNode } from "react";
import { CircleAlert, MoreHorizontal, Plus, RotateCcw } from "lucide-react";
import { DesktopMenuItem, DesktopMenuSeparator, DesktopMenuSurface } from "../../../components/DesktopMenu";

type AgentSurfaceHeaderProps = {
  title: string;
  runtimeLabel?: string;
  statusLabel: string;
  loading: boolean;
  newSessionDisabled: boolean;
  onNewSession: () => void;
  agentSelector?: ReactNode;
  diagnostic?: string | null;
  closeDisabled?: boolean;
  onCloseSession?: () => void;
  onCompactSession?: () => void;
  canCompact?: boolean;
};

export function AgentSurfaceHeader({
  title,
  runtimeLabel = "Agent",
  statusLabel,
  loading,
  newSessionDisabled,
  onNewSession,
  agentSelector = null,
  diagnostic,
  closeDisabled = false,
  onCloseSession,
  onCompactSession,
  canCompact = false,
}: AgentSurfaceHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [menuOpen]);

  return (
    <header className="desktop-agent-session-header">
      <div className="desktop-agent-session-identity">
        {agentSelector && <div className="desktop-agent-session-agent-selector">{agentSelector}</div>}
      </div>
      <div className="desktop-agent-session-heading">
        <strong title={title}>{title}</strong>
        <span><i className={`is-${statusLabel.replace(/\s+/g, "-")}`} />{statusLabel}</span>
      </div>
      <div className="desktop-agent-session-header-actions" ref={menuRef}>
        <button type="button" className="desktop-agent-icon-button" aria-label={`New ${runtimeLabel} session`} title={`New ${runtimeLabel} session`} disabled={loading || newSessionDisabled} onClick={onNewSession}><Plus size={15} /></button>
        <button type="button" className="desktop-agent-icon-button" aria-label={`${runtimeLabel} session actions`} title="Session actions" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal size={16} /></button>
        {menuOpen && (
          <DesktopMenuSurface ariaLabel={`${runtimeLabel} session actions`} className="desktop-menu-surface desktop-agent-session-menu">
            <DesktopMenuItem icon={<CircleAlert size={15} />} label="Diagnostics" detail={diagnostic || "No diagnostics reported."} disabled />
            {(canCompact || onCloseSession) && <DesktopMenuSeparator />}
            {canCompact && onCompactSession && <DesktopMenuItem icon={<RotateCcw size={15} />} label="Compact context" disabled={loading || newSessionDisabled} onClick={() => { setMenuOpen(false); onCompactSession(); }} />}
            {onCloseSession && <DesktopMenuItem icon={<RotateCcw size={15} />} label="Close active connection" disabled={loading || closeDisabled} onClick={() => { setMenuOpen(false); onCloseSession(); }} />}
          </DesktopMenuSurface>
        )}
      </div>
    </header>
  );
}
