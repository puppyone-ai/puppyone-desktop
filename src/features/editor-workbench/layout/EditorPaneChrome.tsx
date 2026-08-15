import { useCallback, useRef, type MouseEvent, type RefObject } from "react";
import { useLocalization } from "@puppyone/localization";
import type {
  EditorFindCommand,
  EditorPaneLayoutLeaf,
  EditorPaneMenuContribution,
  EditorPaneSplitOptions,
  EditorSplitDirection,
} from "@puppyone/shared-ui";
import type { PaneMoveDragController } from "../drag-and-drop/usePaneMoveDrag";
import { EditorPaneActionsMenu } from "./EditorPaneActionsMenu";

export type EditorPaneChromeProps = Readonly<{
  actionsOpen: boolean;
  editorLabel: string | null;
  externalOpenAppName: string | null;
  findCommand: EditorFindCommand | null;
  menuContribution: EditorPaneMenuContribution | null;
  pane: EditorPaneLayoutLeaf;
  paneCount: number;
  paneMove: PaneMoveDragController;
  paneRef: RefObject<HTMLElement | null>;
  onActionsPaneChange: (paneId: string | null) => void;
  onClose: () => void;
  onOpenExternal: (() => void | Promise<void>) | null;
  onSplit: (
    direction: EditorSplitDirection,
    placement: NonNullable<EditorPaneSplitOptions["placement"]>,
  ) => void;
}>;

/**
 * Pane-owned interaction chrome. The document runtime never owns menu or drag
 * state, and the floating menu is rendered outside the pane clipping tree.
 */
export function EditorPaneChrome({
  actionsOpen,
  editorLabel,
  externalOpenAppName,
  findCommand,
  menuContribution,
  pane,
  paneCount,
  paneMove,
  paneRef,
  onActionsPaneChange,
  onClose,
  onOpenExternal,
  onSplit,
}: EditorPaneChromeProps) {
  const { t } = useLocalization();
  const handleRef = useRef<HTMLButtonElement>(null);
  const canMovePane = paneCount > 1;
  const showPaneHandle = Boolean(editorLabel) || canMovePane;
  const handleLabel = canMovePane
    ? t("editor.panes.dragToMove")
    : editorLabel
      ? t("editor.panes.actionsFor", { name: editorLabel })
      : t("editor.panes.actions");
  const closeMenu = useCallback(
    () => onActionsPaneChange(null),
    [onActionsPaneChange],
  );
  const toggleMenu = useCallback(
    () => onActionsPaneChange(actionsOpen ? null : pane.id),
    [actionsOpen, onActionsPaneChange, pane.id],
  );

  if (!showPaneHandle) return null;

  const onKeyboardClick = (event: MouseEvent<HTMLButtonElement>) => {
    // Pointer gestures are resolved synchronously on pointerup. A click with
    // detail=0 is keyboard/assistive activation and must remain supported.
    if (event.detail === 0) toggleMenu();
  };

  return (
    <>
      <div className="desktop-editor-pane-handle-shell">
        <button
          ref={handleRef}
          className="desktop-editor-pane-handle"
          type="button"
          aria-label={handleLabel}
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
          title={handleLabel}
          onPointerEnter={() => {
            if (canMovePane && paneRef.current) paneMove.prepare(paneRef.current, pane.id);
          }}
          onClick={onKeyboardClick}
          onPointerDown={(event) => {
            if (event.button === 0 && canMovePane) paneMove.start(event, pane);
          }}
          onPointerMove={paneMove.move}
          onPointerUp={(event) => {
            if (event.button !== 0) return;
            const result = canMovePane ? paneMove.end(event) : "press";
            if (result === "press") toggleMenu();
          }}
          onPointerCancel={paneMove.cancel}
          onLostPointerCapture={paneMove.lostCapture}
        >
          <i /><i /><i />
        </button>
      </div>
      <EditorPaneActionsMenu
        anchorRef={handleRef}
        editorLabel={editorLabel}
        externalOpenAppName={externalOpenAppName}
        findCommand={findCommand}
        menuContribution={menuContribution}
        open={actionsOpen}
        onCloseMenu={closeMenu}
        onClosePane={onClose}
        onOpenExternal={onOpenExternal}
        onSplit={onSplit}
      />
    </>
  );
}
