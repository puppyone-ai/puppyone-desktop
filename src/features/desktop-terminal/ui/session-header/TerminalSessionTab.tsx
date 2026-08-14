import { memo, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { X } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import { DesktopMenuIconButton } from "../../../../components/DesktopMenu";
import { TerminalSessionHeaderStatus } from "./TerminalSessionHeaderStatus";
import type { TerminalSessionHeaderItem } from "./types";

type TerminalSessionTabProps = {
  active: boolean;
  compact: boolean;
  index: number;
  item: TerminalSessionHeaderItem;
  onActivate: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => void;
  panelId: (sessionId: string) => string;
  tabId: (sessionId: string) => string;
  width: number;
};

export const TerminalSessionTab = memo(function TerminalSessionTab({
  active,
  compact,
  index,
  item,
  onActivate,
  onClose,
  onKeyDown,
  panelId,
  tabId,
  width,
}: TerminalSessionTabProps) {
  const { t } = useLocalization();
  const { presentation, runtime, session } = item;

  return (
    <div
      className={`desktop-terminal-tab ${active ? "is-active" : ""} ${compact ? "is-compact" : ""}`}
      data-status={session.status}
      role="presentation"
      style={{ "--desktop-terminal-tab-resolved-width": `${width}px` } as CSSProperties}
    >
      <button
        id={tabId(session.id)}
        type="button"
        className="desktop-terminal-tab-select"
        role="tab"
        aria-controls={panelId(session.id)}
        aria-label={presentation.accessibleLabel}
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        title={presentation.accessibleLabel}
        onClick={() => onActivate(session.id)}
        onKeyDown={(event) => onKeyDown(event, index)}
      >
        <TerminalSessionHeaderStatus
          className="desktop-terminal-tab-status"
          runtime={runtime}
          session={session}
        />
        <span className="desktop-terminal-tab-title">{presentation.pathLabel}</span>
      </button>
      <DesktopMenuIconButton
        className="desktop-terminal-tab-close"
        label={t("terminal.closeSession", { title: presentation.sessionTitle })}
        icon={<X size={12} strokeWidth={1.8} aria-hidden="true" />}
        onClick={() => onClose(session.id)}
      />
    </div>
  );
});
