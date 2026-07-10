import { useEffect, useRef, useState } from "react";
import { ChevronDown, CircleAlert, LogOut, Plus, RotateCcw } from "lucide-react";
import { DesktopMenuItem, DesktopMenuSeparator, DesktopMenuSurface } from "../../components/DesktopMenu";

type AgentSurfaceHeaderProps = {
  title: string;
  statusLabel: string;
  loading: boolean;
  newSessionDisabled: boolean;
  onNewSession: () => void;
  diagnostic?: string | null;
  closeDisabled: boolean;
  onCloseSession: () => void;
  onResetSession: () => void;
};

export function AgentSurfaceHeader({
  title,
  statusLabel,
  loading,
  newSessionDisabled,
  onNewSession,
  diagnostic,
  closeDisabled,
  onCloseSession,
  onResetSession,
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
      <div>
        <strong>{title}</strong>
        <span>{statusLabel}</span>
      </div>
      <div className="desktop-agent-session-header-actions" ref={menuRef}>
        <button
          type="button"
          className="desktop-agent-icon-button"
          aria-label="New Codex session"
          title="New Codex session"
          disabled={loading || newSessionDisabled}
          onClick={onNewSession}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className="desktop-agent-icon-button"
          aria-label="Codex session actions"
          title="Codex session actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <ChevronDown size={14} />
        </button>
        {menuOpen && (
          <DesktopMenuSurface
            ariaLabel="Codex session actions"
            className="desktop-menu-surface desktop-agent-session-menu"
          >
            <DesktopMenuItem
              icon={<CircleAlert size={15} />}
              label="Diagnostics"
              detail={diagnostic || "No diagnostics reported."}
              disabled
            />
            <DesktopMenuSeparator />
            <DesktopMenuItem
              icon={<RotateCcw size={15} />}
              label="Reset session"
              disabled={loading || newSessionDisabled}
              onClick={() => {
                setMenuOpen(false);
                onResetSession();
              }}
            />
            <DesktopMenuItem
              icon={<LogOut size={15} />}
              label="Close session"
              destructive
              disabled={loading || closeDisabled}
              onClick={() => {
                setMenuOpen(false);
                onCloseSession();
              }}
            />
          </DesktopMenuSurface>
        )}
      </div>
    </header>
  );
}
