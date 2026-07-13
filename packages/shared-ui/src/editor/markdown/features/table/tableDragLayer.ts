import type { EditorView } from "@codemirror/view";
import type { MarkdownTableAlignment, MarkdownTableRow } from "./tableModel";
import { stopCodeMirrorEvent } from "../../shared/widgets/widgetDom";
import { showMarkdownTableContextMenu } from "./tableContextMenu";
import {
  dispatchMarkdownTableStructureOperation,
  getActiveMarkdownTableCellDraft,
  type MarkdownTableDispatchContext,
} from "./tableCommands";
import {
  closeActiveMarkdownTableMenu,
  hasActiveMarkdownTableMenu,
  isActiveMarkdownTableMenu,
} from "./tableMenuState";
import { getMarkdownLocalization } from "../../core/editor/markdownLocalization";

export type MarkdownTableDragHandleContext = {
  alignments: readonly MarkdownTableAlignment[];
  columnCount: number;
  rows: readonly MarkdownTableRow[];
  table: HTMLTableElement;
  tableFrom: number;
  tableTo: number;
  view: EditorView;
  wrapper: HTMLElement;
};

type MarkdownTableDragKind = "column" | "row";

export type MarkdownTableDragLayer = {
  dispose: () => void;
  element: HTMLElement;
};

export function createMarkdownTableDragLayer(context: MarkdownTableDragHandleContext): MarkdownTableDragLayer {
  const localization = getMarkdownLocalization(context.view);
  const doc = context.table.ownerDocument;
  const layer = doc.createElement("div");
  layer.className = "cm-md-table-drag-layer";
  if (context.view.state.readOnly) {
    return { dispose() {}, element: layer };
  }

  const columnHandle = createMarkdownTableHandleElement(
    doc,
    "column",
    localization.t("editor.markdown.table.columnHandleHint"),
  );
  const rowHandle = createMarkdownTableHandleElement(
    doc,
    "row",
    localization.t("editor.markdown.table.rowHandleHint"),
  );
  const dropIndicator = doc.createElement("div");
  dropIndicator.className = "cm-md-table-drop-indicator";
  dropIndicator.hidden = true;
  layer.append(columnHandle, rowHandle, dropIndicator);

  // Single handle pair driven by the hovered cell: the row handle straddles
  // the left border of the hovered row, the column handle straddles the top
  // border of the hovered column. The header row is fixed and gets no row
  // handle. Visibility is class-driven (not [hidden]) so show/hide can fade
  // and position changes can glide.
  const hover: { columnIndex: number | null; rowIndex: number | null; dragging: boolean } = {
    columnIndex: null,
    rowIndex: null,
    dragging: false,
  };
  let activeDragCleanup: (() => void) | null = null;
  let disposed = false;
  let ownedMenu: HTMLElement | null = null;

  const getBodyRowElements = () => Array.from(context.table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  const getHeaderCellElements = () => Array.from(context.table.querySelectorAll<HTMLTableCellElement>("thead th"));

  const setHandleVisible = (handle: HTMLElement, visible: boolean) => {
    handle.classList.toggle("is-visible", visible);
  };

  const showHandleAt = (handle: HTMLElement, left: string, top: string) => {
    const wasVisible = handle.classList.contains("is-visible");
    handle.style.left = left;
    handle.style.top = top;
    if (!wasVisible) {
      // Flush the position write first so the fade-in starts in place
      // instead of gliding over from the previous row/column.
      handle.getBoundingClientRect();
      handle.classList.add("is-visible");
    }
  };

  const positionHandles = () => {
    if (disposed) return;
    const surface = layer.parentElement;
    if (!surface || !layer.isConnected) return;
    const surfaceRect = surface.getBoundingClientRect();

    const headerCell = hover.columnIndex == null ? null : getHeaderCellElements()[hover.columnIndex] ?? null;
    if (headerCell && hover.columnIndex != null) {
      const rect = headerCell.getBoundingClientRect();
      showHandleAt(columnHandle, `${rect.left - surfaceRect.left + rect.width / 2}px`, "0px");
      columnHandle.setAttribute(
        "aria-label",
        localization.t("editor.markdown.table.columnActions", {
          column: hover.columnIndex + 1,
        }),
      );
    } else {
      setHandleVisible(columnHandle, false);
    }

    const bodyRow = hover.rowIndex == null || hover.rowIndex < 1
      ? null
      : getBodyRowElements()[hover.rowIndex - 1] ?? null;
    if (bodyRow && hover.rowIndex != null) {
      const rect = bodyRow.getBoundingClientRect();
      if (localization.direction === "rtl") {
        rowHandle.style.right = "0px";
        showHandleAt(rowHandle, "", `${rect.top - surfaceRect.top + rect.height / 2}px`);
      } else {
        rowHandle.style.removeProperty("right");
        showHandleAt(rowHandle, "0px", `${rect.top - surfaceRect.top + rect.height / 2}px`);
      }
      rowHandle.setAttribute(
        "aria-label",
        localization.t("editor.markdown.table.rowActions", { row: hover.rowIndex }),
      );
    } else {
      setHandleVisible(rowHandle, false);
    }
  };

  const updateHoverFromEvent = (event: Event) => {
    if (disposed || hover.dragging) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cell = target.closest("td, th");
    if (!(cell instanceof HTMLTableCellElement) || !context.table.contains(cell)) return;
    const rowElement = cell.parentElement;
    if (!(rowElement instanceof HTMLTableRowElement)) return;
    const nextColumnIndex = cell.cellIndex;
    const nextRowIndex = cell.tagName === "TH" ? 0 : getBodyRowElements().indexOf(rowElement) + 1;
    if (nextColumnIndex === hover.columnIndex && nextRowIndex === hover.rowIndex) return;
    hover.columnIndex = nextColumnIndex;
    hover.rowIndex = nextRowIndex;
    positionHandles();
  };

  const clearHover = () => {
    if (disposed || hover.dragging || hasActiveMarkdownTableMenu()) return;
    hover.columnIndex = null;
    hover.rowIndex = null;
    positionHandles();
  };

  context.table.addEventListener("pointerover", updateHoverFromEvent);
  context.wrapper.addEventListener("pointerleave", clearHover);

  const buildDispatchContext = (): MarkdownTableDispatchContext => ({
    alignments: context.alignments,
    currentDraft: getActiveMarkdownTableCellDraft(context.wrapper),
    rows: context.rows,
    tableFrom: context.tableFrom,
    tableTo: context.tableTo,
    view: context.view,
  });

  const openHandleMenu = (kind: MarkdownTableDragKind, sourceIndex: number, handle: HTMLElement) => {
    closeActiveMarkdownTableMenu();
    setDragSourceHighlight(kind, sourceIndex, true);
    handle.classList.add("is-menu-active");
    // The button is deliberately larger than the visible grip. Anchor menus
    // to the grip so increasing hit slop never makes the menu drift away.
    const anchor = handle.querySelector<HTMLElement>(".cm-md-table-drag-handle-visual") ?? handle;
    const rect = anchor.getBoundingClientRect();
    let nextMenu: HTMLElement | null = null;
    nextMenu = showMarkdownTableContextMenu(buildDispatchContext(), {
      clientX: kind === "row"
        ? localization.direction === "rtl" ? rect.left - 4 : rect.right + 4
        : rect.left,
      clientY: kind === "row" ? rect.top : rect.bottom + 4,
      columnCount: context.columnCount,
      columnIndex: kind === "column" ? sourceIndex : hover.columnIndex ?? 0,
      onClose: () => {
        setDragSourceHighlight(kind, sourceIndex, false);
        handle.classList.remove("is-menu-active");
        handle.setAttribute("aria-expanded", "false");
        handle.removeAttribute("aria-controls");
        if (ownedMenu === nextMenu) ownedMenu = null;
        if (!disposed) positionHandles();
      },
      rowCount: context.rows.length,
      rowIndex: kind === "row" ? sourceIndex : hover.rowIndex ?? 0,
      scope: kind,
    });
    ownedMenu = nextMenu;
    handle.setAttribute("aria-controls", nextMenu.id);
    handle.setAttribute("aria-expanded", "true");
  };

  const setDragSourceHighlight = (kind: MarkdownTableDragKind, sourceIndex: number, active: boolean) => {
    if (kind === "row") {
      const row = getBodyRowElements()[sourceIndex - 1];
      if (!row) return;
      for (const cell of Array.from(row.cells)) {
        cell.classList.toggle("cm-md-table-drag-source", active);
      }
      return;
    }
    for (const row of [...getHeaderCellElements().map((cell) => cell.parentElement), ...getBodyRowElements()]) {
      if (!(row instanceof HTMLTableRowElement)) continue;
      const cell = row.cells[sourceIndex];
      cell?.classList.toggle("cm-md-table-drag-source", active);
    }
  };

  const renderDropIndicator = (kind: MarkdownTableDragKind, sourceIndex: number, boundary: number | null) => {
    const surface = layer.parentElement;
    if (!surface || boundary == null) {
      dropIndicator.hidden = true;
      return;
    }
    const surfaceRect = surface.getBoundingClientRect();
    const tableRect = context.table.getBoundingClientRect();

    if (kind === "row") {
      const bodyRows = getBodyRowElements();
      const sourceBodyIndex = sourceIndex - 1;
      const finalIndex = boundary > sourceBodyIndex ? boundary - 1 : boundary;
      if (finalIndex === sourceBodyIndex || bodyRows.length === 0) {
        dropIndicator.hidden = true;
        return;
      }
      const y = boundary < bodyRows.length
        ? bodyRows[boundary].getBoundingClientRect().top
        : bodyRows[bodyRows.length - 1].getBoundingClientRect().bottom;
      dropIndicator.hidden = false;
      dropIndicator.className = "cm-md-table-drop-indicator is-row";
      dropIndicator.style.left = `${tableRect.left - surfaceRect.left}px`;
      dropIndicator.style.top = `${y - surfaceRect.top}px`;
      dropIndicator.style.width = `${tableRect.width}px`;
      dropIndicator.style.height = "";
      return;
    }

    const headerCells = getHeaderCellElements();
    const finalIndex = boundary > sourceIndex ? boundary - 1 : boundary;
    if (finalIndex === sourceIndex || headerCells.length === 0) {
      dropIndicator.hidden = true;
      return;
    }
    const x = localization.direction === "rtl"
      ? boundary < headerCells.length
        ? headerCells[boundary].getBoundingClientRect().right
        : headerCells[headerCells.length - 1].getBoundingClientRect().left
      : boundary < headerCells.length
        ? headerCells[boundary].getBoundingClientRect().left
        : headerCells[headerCells.length - 1].getBoundingClientRect().right;
    dropIndicator.hidden = false;
    dropIndicator.className = "cm-md-table-drop-indicator is-column";
    dropIndicator.style.left = `${x - surfaceRect.left}px`;
    dropIndicator.style.top = `${tableRect.top - surfaceRect.top}px`;
    dropIndicator.style.width = "";
    dropIndicator.style.height = `${tableRect.height}px`;
  };

  const startHandleDrag = (event: PointerEvent, kind: MarkdownTableDragKind) => {
    if (disposed || event.button !== 0) return;
    const sourceIndex = kind === "column" ? hover.columnIndex : hover.rowIndex;
    if (sourceIndex == null) return;
    event.preventDefault();
    event.stopPropagation();
    closeActiveMarkdownTableMenu();
    activeDragCleanup?.();

    const handle = kind === "column" ? columnHandle : rowHandle;
    const otherHandle = kind === "column" ? rowHandle : columnHandle;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    let dropBoundary: number | null = null;

    hover.dragging = true;
    handle.setPointerCapture(pointerId);
    setDragSourceHighlight(kind, sourceIndex, true);

    const beginVisualDrag = () => {
      handle.classList.add("is-dragging");
      setHandleVisible(otherHandle, false);
      context.wrapper.classList.add("is-table-dragging");
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      if (!moved) {
        if (Math.abs(moveEvent.clientX - startX) <= 4 && Math.abs(moveEvent.clientY - startY) <= 4) return;
        moved = true;
        beginVisualDrag();
      }
      dropBoundary = kind === "column"
        ? getMarkdownTableColumnDropBoundary(
          getHeaderCellElements(),
          moveEvent.clientX,
          localization.direction,
        )
        : getMarkdownTableDropBoundary(getBodyRowElements().map((row) => {
          const rect = row.getBoundingClientRect();
          return { start: rect.top, size: rect.height };
        }), moveEvent.clientY);
      renderDropIndicator(kind, sourceIndex, dropBoundary);
    };

    const applyMove = () => {
      if (dropBoundary == null) return;
      if (kind === "column") {
        const targetColumnIndex = dropBoundary > sourceIndex ? dropBoundary - 1 : dropBoundary;
        if (targetColumnIndex === sourceIndex) return;
        dispatchMarkdownTableStructureOperation(buildDispatchContext(), {
          type: "move-column-to",
          rowIndex: hover.rowIndex ?? 0,
          columnIndex: sourceIndex,
          targetColumnIndex,
        });
        return;
      }
      const sourceBodyIndex = sourceIndex - 1;
      const targetBodyIndex = dropBoundary > sourceBodyIndex ? dropBoundary - 1 : dropBoundary;
      if (targetBodyIndex === sourceBodyIndex) return;
      dispatchMarkdownTableStructureOperation(buildDispatchContext(), {
        type: "move-row-to",
        rowIndex: sourceIndex,
        columnIndex: hover.columnIndex ?? 0,
        targetRowIndex: targetBodyIndex + 1,
      });
    };

    const cleanup = ({ preserveSourceHighlight = false }: { preserveSourceHighlight?: boolean } = {}) => {
      if (activeDragCleanup !== cleanup) return;
      activeDragCleanup = null;
      hover.dragging = false;
      handle.classList.remove("is-dragging");
      context.wrapper.classList.remove("is-table-dragging");
      dropIndicator.hidden = true;
      if (!preserveSourceHighlight) setDragSourceHighlight(kind, sourceIndex, false);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerCancel);
      doc.removeEventListener("keydown", onKeyDown, true);
      if (!disposed) positionHandles();
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      upEvent.preventDefault();
      upEvent.stopPropagation();
      const shouldApply = moved;
      cleanup({ preserveSourceHighlight: !shouldApply });
      if (!shouldApply) {
        openHandleMenu(kind, sourceIndex, handle);
        return;
      }
      applyMove();
    };

    const onPointerCancel = (cancelEvent: PointerEvent) => {
      cancelEvent.preventDefault();
      cancelEvent.stopPropagation();
      cleanup();
    };

    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      cleanup();
    };

    activeDragCleanup = cleanup;
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerCancel);
    doc.addEventListener("keydown", onKeyDown, true);
  };

  const bindHandle = (handle: HTMLButtonElement, kind: MarkdownTableDragKind) => {
    handle.addEventListener("pointerdown", (event) => startHandleDrag(event, kind));
    handle.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const sourceIndex = kind === "column" ? hover.columnIndex : hover.rowIndex;
      if (sourceIndex == null) return;
      openHandleMenu(kind, sourceIndex, handle);
    });
    handle.addEventListener("mousedown", stopCodeMirrorEvent);
    handle.addEventListener("click", stopCodeMirrorEvent);
  };
  bindHandle(columnHandle, "column");
  bindHandle(rowHandle, "row");

  return {
    element: layer,
    dispose() {
      if (disposed) return;
      disposed = true;
      activeDragCleanup?.();
      context.table.removeEventListener("pointerover", updateHoverFromEvent);
      context.wrapper.removeEventListener("pointerleave", clearHover);
      if (ownedMenu && isActiveMarkdownTableMenu(ownedMenu)) {
        closeActiveMarkdownTableMenu();
      }
      ownedMenu = null;
    },
  };
}

function createMarkdownTableHandleElement(
  doc: Document,
  kind: MarkdownTableDragKind,
  title: string,
): HTMLButtonElement {
  const handle = doc.createElement("button");
  handle.type = "button";
  handle.className = `cm-md-table-drag-handle cm-md-table-${kind}-handle`;
  // Pointer-only affordance: it fades with hover, so keep it out of the tab
  // order (the context menu covers keyboard access to the same operations).
  handle.tabIndex = -1;
  handle.setAttribute("aria-expanded", "false");
  handle.setAttribute("aria-haspopup", "menu");
  handle.title = title;
  const visual = doc.createElement("span");
  visual.className = "cm-md-table-drag-handle-visual";
  visual.setAttribute("aria-hidden", "true");
  handle.appendChild(visual);
  return handle;
}

function getMarkdownTableColumnDropBoundary(
  cells: readonly HTMLTableCellElement[],
  pointer: number,
  direction: "ltr" | "rtl",
): number | null {
  if (cells.length === 0) return null;
  if (direction === "ltr") {
    return getMarkdownTableDropBoundary(cells.map((cell) => {
      const rect = cell.getBoundingClientRect();
      return { start: rect.left, size: rect.width };
    }), pointer);
  }

  for (const [index, cell] of cells.entries()) {
    const rect = cell.getBoundingClientRect();
    if (pointer > rect.left + rect.width / 2) return index;
  }
  return cells.length;
}

function getMarkdownTableDropBoundary(
  segments: Array<{ start: number; size: number }>,
  pointer: number,
): number | null {
  if (segments.length === 0) return null;
  for (const [index, segment] of segments.entries()) {
    if (pointer < segment.start + segment.size / 2) return index;
  }
  return segments.length;
}
