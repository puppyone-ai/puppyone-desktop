import { useRef, type ReactNode } from "react";
import { useLocalization } from "@puppyone/localization";
import type {
  EditorFindCommand,
  EditorPaneLayoutLeaf,
  EditorPaneMenuContribution,
  EditorPaneSplitOptions,
  EditorSplitDirection,
} from "@puppyone/shared-ui";
import type { EditorFileDropController } from "../drag-and-drop/useExplorerFileDrop";
import type { PaneMoveDragController } from "../drag-and-drop/usePaneMoveDrag";
import { EditorPaneChrome } from "./EditorPaneChrome";
import { useEditorPaneChromeReveal } from "./useEditorPaneChromeReveal";

export type EditorPaneShellProps = Readonly<{
  active: boolean;
  actionsOpen: boolean;
  children: ReactNode;
  editorLabel: string | null;
  externalOpenAppName: string | null;
  fileDrop: EditorFileDropController;
  findCommand: EditorFindCommand | null;
  menuContribution: EditorPaneMenuContribution | null;
  pane: EditorPaneLayoutLeaf;
  paneCount: number;
  paneMove: PaneMoveDragController;
  onActionsPaneChange: (paneId: string | null) => void;
  onActivate: () => void;
  onClose: () => void;
  onOpenExternal: (() => void | Promise<void>) | null;
  onSplit: (
    direction: EditorSplitDirection,
    placement: NonNullable<EditorPaneSplitOptions["placement"]>,
  ) => void;
}>;

/** Lightweight interaction chrome around a memoized Viewer runtime. */
export function EditorPaneShell({
  active,
  actionsOpen,
  children,
  editorLabel,
  externalOpenAppName,
  fileDrop,
  findCommand,
  menuContribution,
  pane,
  paneCount,
  paneMove,
  onActionsPaneChange,
  onActivate,
  onClose,
  onOpenExternal,
  onSplit,
}: EditorPaneShellProps) {
  const { t } = useLocalization();
  const paneRef = useRef<HTMLElement>(null);
  const chromeReveal = useEditorPaneChromeReveal(paneRef, actionsOpen);
  const paneMoveEdge = paneMove.dropIntent?.targetPaneId === pane.id
    ? paneMove.dropIntent.edge
    : null;
  const fileDropEdge = fileDrop.dropIntent?.targetPaneId === pane.id
    ? fileDrop.dropIntent.edge
    : null;
  const dropEdge = fileDropEdge ?? paneMoveEdge;

  return (
    <section
      ref={paneRef}
      className="desktop-editor-pane"
      data-editor-pane-id={pane.id}
      data-active={active ? "true" : undefined}
      data-empty={editorLabel ? undefined : "true"}
      data-handle-hot={chromeReveal.revealed ? "true" : undefined}
      data-pane-menu-open={actionsOpen ? "true" : undefined}
      data-drop-target={dropEdge ?? undefined}
      data-drop-kind={fileDropEdge ? "file" : paneMoveEdge ? "pane" : undefined}
      aria-label={editorLabel
        ? t("editor.panes.label", { name: editorLabel })
        : t("editor.panes.empty")}
      onFocusCapture={onActivate}
      onPointerMove={chromeReveal.onPointerMove}
      onPointerLeave={chromeReveal.onPointerLeave}
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
      <EditorPaneChrome
        actionsOpen={actionsOpen}
        editorLabel={editorLabel}
        externalOpenAppName={externalOpenAppName}
        findCommand={findCommand}
        menuContribution={menuContribution}
        pane={pane}
        paneCount={paneCount}
        paneMove={paneMove}
        paneRef={paneRef}
        onActionsPaneChange={onActionsPaneChange}
        onClose={onClose}
        onOpenExternal={onOpenExternal}
        onSplit={onSplit}
      />
      <div className="desktop-editor-pane-content">{children}</div>
      {dropEdge && <div className="desktop-editor-drop-preview" data-edge={dropEdge} />}
      <div className="desktop-editor-pane-interaction-frame" aria-hidden="true" />
    </section>
  );
}
