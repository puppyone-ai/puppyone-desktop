import { Eraser, RotateCcw } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";

type TerminalSurfaceHeaderProps = {
  onClear: () => void;
  onReset: () => void;
};

export function TerminalSurfaceHeader({ onClear, onReset }: TerminalSurfaceHeaderProps) {
  const { t } = useLocalization();
  return (
    <header className="desktop-terminal-surface-header">
      <strong className="desktop-terminal-surface-title">{t("terminal.title")}</strong>
      <div className="desktop-terminal-surface-actions">
        <button
          type="button"
          className="desktop-terminal-icon-button"
          title={t("terminal.clear")}
          aria-label={t("terminal.clear")}
          onClick={onClear}
        >
          <Eraser size={14} />
        </button>
        <button
          type="button"
          className="desktop-terminal-icon-button"
          title={t("terminal.reset")}
          aria-label={t("terminal.reset")}
          onClick={onReset}
        >
          <RotateCcw size={14} />
        </button>
      </div>
    </header>
  );
}
