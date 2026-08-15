import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useLocalization } from "@puppyone/localization";
import { Check, ExternalLink, Search, X } from "lucide-react";
import type {
  EditorFindCommand,
  EditorPaneLayoutLeaf,
  EditorPaneMenuContribution,
} from "@puppyone/shared-ui";
import {
  DesktopMenuItem,
  DesktopMenuSection,
  DesktopMenuSurface,
} from "../../../components/DesktopMenu";
import type { EditorFileDropController } from "../drag-and-drop/useExplorerFileDrop";
import type { PaneMoveDragController } from "../drag-and-drop/usePaneMoveDrag";

/** Ghostty-style reveal: the grab dots appear in the leading third of the pane. */
export const PANE_HANDLE_REVEAL_RATIO = 1 / 3;

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
}: EditorPaneShellProps) {
  const { t } = useLocalization();
  const actionsRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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
    setHandleHotIfChanged(isPointInPaneHandleRevealZone(rect, clientX, clientY));
  };

  const onPanePointerMove = (event: PointerEvent<HTMLElement>) => {
    updateHandleHotFromPoint(event.clientX, event.clientY);
  };

  useEffect(() => {
    if (!actionsOpen) return undefined;
    menuRef.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]')
      ?.focus({ preventScroll: true });
    const close = (event: globalThis.PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) onActionsPaneChange(null);
    };
    const closeOnFocusExit = (event: FocusEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) onActionsPaneChange(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onActionsPaneChange(null);
        handleRef.current?.focus({ preventScroll: true });
        return;
      }
      const menu = menuRef.current;
      if (!menu?.contains(event.target as Node)) return;
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = Array.from(
        menu.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)'),
      );
      if (items.length === 0) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowUp"
            ? (currentIndex - 1 + items.length) % items.length
            : (currentIndex + 1) % items.length;
      items[nextIndex]?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("focusin", closeOnFocusExit, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("focusin", closeOnFocusExit, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [actionsOpen, onActionsPaneChange]);

  const runAndClose = (action: () => void | Promise<void>) => {
    onActionsPaneChange(null);
    void action();
  };

  const hasFileActions = Boolean(findCommand || onOpenExternal);
  const viewItems = menuContribution?.viewItems ?? [];
  const showPaneHandle = Boolean(editorLabel) || paneCount > 1;
  const handleLabel = paneCount > 1
    ? t("editor.panes.dragToMove")
    : editorLabel
      ? t("editor.panes.actionsFor", { name: editorLabel })
      : t("editor.panes.actions");

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
      {showPaneHandle && (
        <div className="desktop-editor-pane-handle-shell" ref={actionsRef}>
          <button
            ref={handleRef}
            className="desktop-editor-pane-handle"
            type="button"
            aria-label={handleLabel}
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
            title={handleLabel}
            onClick={() => {
              if (!paneMove.consumeDraggedClick()) {
                onActionsPaneChange(actionsOpen ? null : pane.id);
              }
            }}
            onPointerDown={(event) => {
              if (event.button === 0 && paneCount > 1) paneMove.start(event, pane);
            }}
            onPointerMove={paneMove.move}
            onPointerUp={paneMove.end}
            onPointerCancel={paneMove.cancel}
            onLostPointerCapture={paneMove.lostCapture}
          >
            <i /><i /><i />
          </button>
          {actionsOpen && (
            <DesktopMenuSurface
              ref={menuRef}
              className="desktop-editor-pane-menu"
              ariaLabel={editorLabel
                ? t("editor.panes.actionsFor", { name: editorLabel })
                : t("editor.panes.actions")}
            >
              {editorLabel && <div className="desktop-editor-pane-menu-title" dir="auto">{editorLabel}</div>}
              {hasFileActions && (
                <DesktopMenuSection label={t("editor.panes.fileActions")}>
                  {findCommand && (
                    <DesktopMenuItem
                      icon={<Search size={14} strokeWidth={1.9} />}
                      label={t("editor.find.label")}
                      trailing="⌘F"
                      onClick={() => runAndClose(findCommand.open)}
                    />
                  )}
                  {onOpenExternal && (
                    <DesktopMenuItem
                      icon={<ExternalLink size={14} strokeWidth={1.9} />}
                      label={externalOpenAppName
                        ? t("editor.panes.openInApp", { app: externalOpenAppName })
                        : t("editor.openDefaultApp")}
                      onClick={() => runAndClose(onOpenExternal)}
                    />
                  )}
                </DesktopMenuSection>
              )}
              {viewItems.length > 0 && (
                <DesktopMenuSection label={t("editor.panes.viewActions")}>
                  {viewItems.map((item) => item.kind === "toggle" ? (
                    <DesktopMenuItem
                      key={item.id}
                      icon={item.checked ? <Check size={14} strokeWidth={2} /> : <span />}
                      label={item.label}
                      role="menuitemcheckbox"
                      aria-checked={item.checked}
                      onClick={() => item.setChecked(!item.checked)}
                    />
                  ) : (
                    <DesktopMenuItem
                      key={item.id}
                      disabled={item.disabled}
                      label={item.label}
                      onClick={() => runAndClose(item.run)}
                    />
                  ))}
                </DesktopMenuSection>
              )}
              <DesktopMenuSection label={t("editor.panes.paneActions")}>
                <DesktopMenuItem
                  icon={<X size={14} strokeWidth={1.9} />}
                  label={t("editor.panes.closePane")}
                  onClick={() => runAndClose(onClose)}
                />
              </DesktopMenuSection>
            </DesktopMenuSurface>
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
