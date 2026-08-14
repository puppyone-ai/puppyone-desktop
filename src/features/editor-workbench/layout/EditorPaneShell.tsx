import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useLocalization } from "@puppyone/localization";
import type { EditorPaneLayoutLeaf } from "@puppyone/shared-ui";
import type { EditorFileDropController } from "../drag-and-drop/useExplorerFileDrop";
import type { PaneMoveDragController } from "../drag-and-drop/usePaneMoveDrag";

/** Ghostty-style reveal: the grab dots appear in the leading third of the pane. */
export const PANE_HANDLE_REVEAL_RATIO = 1 / 3;

export type EditorPaneShellProps = Readonly<{
  active: boolean;
  actionsOpen: boolean;
  children: ReactNode;
  editorLabel: string | null;
  fileDrop: EditorFileDropController;
  pane: EditorPaneLayoutLeaf;
  paneCount: number;
  paneMove: PaneMoveDragController;
  onActionsPaneChange: (paneId: string | null) => void;
  onActivate: () => void;
  onClose: () => void;
}>;

/** Lightweight interaction chrome around a memoized Viewer runtime. */
export function EditorPaneShell({
  active,
  actionsOpen,
  children,
  editorLabel,
  fileDrop,
  pane,
  paneCount,
  paneMove,
  onActionsPaneChange,
  onActivate,
  onClose,
}: EditorPaneShellProps) {
  const { t } = useLocalization();
  const actionsRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const handleHotRef = useRef(false);
  const [handleHot, setHandleHot] = useState(false);
  const paneMoveEdge = paneMove.dropIntent?.targetPaneId === pane.id
    ? paneMove.dropIntent.edge
    : null;
  const fileDropEdge = fileDrop.dropIntent?.targetPaneId === pane.id
    ? fileDrop.dropIntent.edge
    : null;
  const dropEdge = fileDropEdge ?? paneMoveEdge;
  const handleRevealed = handleHot || actionsOpen;

  const setHandleHotIfChanged = (next: boolean) => {
    if (handleHotRef.current === next) return;
    handleHotRef.current = next;
    setHandleHot(next);
  };

  const updateHandleHotFromPoint = (clientX: number, clientY: number) => {
    const host = paneRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const next = isPointInPaneHandleRevealZone(rect, clientX, clientY);
    if (next && !handleHotRef.current) paneMove.prepare(host, pane.id);
    setHandleHotIfChanged(next);
  };

  const onPanePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (paneCount < 2) return;
    updateHandleHotFromPoint(event.clientX, event.clientY);
  };

  useEffect(() => {
    if (!actionsOpen) return undefined;
    const close = (event: globalThis.PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) onActionsPaneChange(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [actionsOpen, onActionsPaneChange]);

  return (
    <section
      ref={paneRef}
      className="desktop-editor-pane"
      data-editor-pane-id={pane.id}
      data-active={active ? "true" : undefined}
      data-empty={editorLabel ? undefined : "true"}
      data-handle-hot={handleRevealed ? "true" : undefined}
      data-drop-target={dropEdge ?? undefined}
      data-drop-kind={fileDropEdge ? "file" : paneMoveEdge ? "pane" : undefined}
      aria-label={editorLabel
        ? t("editor.panes.label", { name: editorLabel })
        : t("editor.panes.empty")}
      onFocusCapture={onActivate}
      onPointerMove={onPanePointerMove}
      onPointerLeave={() => setHandleHotIfChanged(false)}
      onPointerUp={(event) => {
        // Focusable editors activate through focus after native caret placement.
        // Pointer-up covers non-focusable previews after selection handling.
        if (event.button === 0) onActivate();
      }}
      onDragEnterCapture={(event) => fileDrop.over(event, pane.id)}
      onDragOverCapture={(event) => fileDrop.over(event, pane.id)}
      onDragLeaveCapture={(event) => fileDrop.leave(event, pane.id)}
      onDropCapture={(event) => fileDrop.drop(event, pane.id)}
    >
      {paneCount > 1 && (
        <div className="desktop-editor-pane-handle-shell" ref={actionsRef}>
          <button
            className="desktop-editor-pane-handle"
            type="button"
            aria-label={t("editor.panes.dragToMove")}
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            title={t("editor.panes.dragToMove")}
            onClick={() => {
              if (!paneMove.consumeDraggedClick()) {
                onActionsPaneChange(actionsOpen ? null : pane.id);
              }
            }}
            onPointerDown={(event) => {
              if (event.button === 0) paneMove.start(event, pane);
            }}
            onPointerMove={paneMove.move}
            onPointerUp={paneMove.end}
            onPointerCancel={paneMove.cancel}
            onLostPointerCapture={paneMove.lostCapture}
          >
            <i /><i /><i />
          </button>
          {actionsOpen && (
            <div className="desktop-editor-pane-menu" role="menu">
              <button
                className="desktop-editor-pane-menu-action"
                role="menuitem"
                type="button"
                aria-label={t("editor.panes.closePane")}
                onClick={() => {
                  onClose();
                  onActionsPaneChange(null);
                }}
              >
                {t("editor.panes.closePane")}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="desktop-editor-pane-content">{children}</div>
      {dropEdge && <div className="desktop-editor-drop-preview" data-edge={dropEdge} />}
    </section>
  );
}

export function isPointInPaneHandleRevealZone(
  rect: Pick<DOMRect, "left" | "right" | "top" | "height">,
  clientX: number,
  clientY: number,
): boolean {
  return clientX >= rect.left
    && clientX <= rect.right
    && clientY >= rect.top
    && clientY < rect.top + rect.height * PANE_HANDLE_REVEAL_RATIO;
}
