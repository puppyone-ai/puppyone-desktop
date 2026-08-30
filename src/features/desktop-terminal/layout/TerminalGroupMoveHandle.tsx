import { memo } from "react";
import { useLocalization } from "@puppyone/localization/react";
import type { TerminalTabMoveDragController } from "../interactions/useTerminalTabMoveDrag";
import { useTerminalDerivedDragClickSuppression } from "../interactions/useTerminalDerivedDragClickSuppression";
import type { DesktopTerminalSessionSummary } from "../model/terminalSessions";

type TerminalGroupMoveHandleProps = Readonly<{
  groupId: string;
  session: DesktopTerminalSessionSummary;
  sessionIds: readonly string[];
  sessionMove: TerminalTabMoveDragController;
  onActivate: (sessionId: string) => void;
}>;

/** Ghostty-style pane grip for the Session currently presented by a Group. */
export const TerminalGroupMoveHandle = memo(function TerminalGroupMoveHandle({
  groupId,
  session,
  sessionIds,
  sessionMove,
  onActivate,
}: TerminalGroupMoveHandleProps) {
  const { t } = useLocalization();
  const {
    consumeSuppressedClick,
    suppressDerivedDragClick,
  } = useTerminalDerivedDragClickSuppression();
  const sessionTitle = t("terminal.sessionTitle", { number: session.ordinal });
  const label = t("terminal.split.dragHandle", { title: sessionTitle });

  return (
    <div className="desktop-terminal-pane-handle-shell">
      <button
        type="button"
        className="desktop-terminal-pane-handle"
        aria-label={label}
        title={label}
        onClick={(event) => {
          if (consumeSuppressedClick()) {
            event.preventDefault();
            return;
          }
          onActivate(session.id);
        }}
        onPointerDown={(event) => sessionMove.start(
          event,
          { kind: "group", groupId, sessionIds },
          sessionTitle,
        )}
        onPointerMove={sessionMove.move}
        onPointerUp={(event) => {
          if (event.button === 0 && sessionMove.end(event) === "drag") {
            suppressDerivedDragClick();
          }
        }}
        onPointerCancel={sessionMove.cancel}
        onLostPointerCapture={sessionMove.lostCapture}
      >
        <i /><i /><i />
      </button>
    </div>
  );
});
