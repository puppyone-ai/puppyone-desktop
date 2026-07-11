import { Eraser, RotateCcw } from "lucide-react";

type TerminalSurfaceHeaderProps = {
  onClear: () => void;
  onReset: () => void;
};

export function TerminalSurfaceHeader({ onClear, onReset }: TerminalSurfaceHeaderProps) {
  return (
    <header className="desktop-terminal-surface-header">
      <strong className="desktop-terminal-surface-title">Terminal</strong>
      <div className="desktop-terminal-surface-actions">
        <button
          type="button"
          className="desktop-terminal-icon-button"
          title="Clear Terminal"
          aria-label="Clear Terminal"
          onClick={onClear}
        >
          <Eraser size={14} />
        </button>
        <button
          type="button"
          className="desktop-terminal-icon-button"
          title="Reset Terminal"
          aria-label="Reset Terminal"
          onClick={onReset}
        >
          <RotateCcw size={14} />
        </button>
      </div>
    </header>
  );
}
