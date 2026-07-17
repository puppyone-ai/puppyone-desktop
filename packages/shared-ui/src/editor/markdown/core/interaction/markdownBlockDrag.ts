import type { Extension, Text } from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  keymap,
  type ViewUpdate,
} from "@codemirror/view";
import {
  buildMarkdownBlockMoveTransaction,
  isMarkdownBlockMoveNoop,
  moveMarkdownBlock,
} from "../commands/markdownBlockMove";
import {
  getMarkdownMovableBlockAt,
  getMarkdownMovableBlockGroup,
  sameMarkdownMovableBlock,
  type MarkdownMovableBlockRef,
} from "../syntax/markdownBlockBoundaries";

const DRAG_THRESHOLD_PX = 4;
const EDGE_SCROLL_ZONE_PX = 48;
const MAX_EDGE_SCROLL_PX = 14;
const HANDLE_SIZE_PX = 22;
const HANDLE_GAP_PX = 8;

type ActiveBlockDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  source: MarkdownMovableBlockRef;
  sourceIndex: number;
  blocks: readonly MarkdownMovableBlockRef[];
  startDocument: Text;
  started: boolean;
  finishing: boolean;
  boundary: number | null;
  clientY: number;
};

type HandleMeasurement = Readonly<{
  source: MarkdownMovableBlockRef;
  left: number;
  top: number;
}> | null;

type DropMeasurement = Readonly<{
  boundary: number;
  indicator: Readonly<{ left: number; top: number; width: number }> | null;
}> | null;

class MarkdownBlockDragController {
  private readonly view: EditorView;
  private readonly layer: HTMLDivElement;
  private readonly handle: HTMLButtonElement;
  private readonly indicator: HTMLDivElement;
  private readonly handleMeasureKey = {};
  private readonly hoverMeasureKey = {};
  private readonly dropMeasureKey = {};
  private hovered: MarkdownMovableBlockRef | null = null;
  private pendingHoverPoint: Readonly<{ clientX: number; clientY: number }> | null = null;
  private drag: ActiveBlockDrag | null = null;
  private autoscrollFrame: number | null = null;
  private disposed = false;

  constructor(view: EditorView) {
    this.view = view;
    const doc = view.dom.ownerDocument;
    this.layer = doc.createElement("div");
    this.layer.className = "cm-md-block-drag-layer";
    this.layer.setAttribute("aria-hidden", "true");

    this.handle = doc.createElement("button");
    this.handle.className = "cm-md-block-drag-handle";
    this.handle.type = "button";
    this.handle.tabIndex = -1;
    this.handle.setAttribute("aria-label", "Move Markdown block");
    const grip = doc.createElement("span");
    grip.className = "cm-md-block-drag-grip";
    this.handle.append(grip);

    this.indicator = doc.createElement("div");
    this.indicator.className = "cm-md-block-drop-indicator";
    this.layer.append(this.handle, this.indicator);
    view.dom.append(this.layer);
    view.dom.classList.add("cm-md-block-drag-enabled");

    view.dom.addEventListener("pointermove", this.onEditorPointerMove, { passive: true });
    view.dom.addEventListener("pointerleave", this.onEditorPointerLeave);
    view.dom.addEventListener("compositionstart", this.onCompositionStart);
    view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
    this.handle.addEventListener("pointerdown", this.onHandlePointerDown);
    this.handle.addEventListener("pointermove", this.onHandlePointerMove);
    this.handle.addEventListener("pointerup", this.onHandlePointerUp);
    this.handle.addEventListener("pointercancel", this.onHandlePointerCancel);
    this.handle.addEventListener("lostpointercapture", this.onLostPointerCapture);
    doc.addEventListener("keydown", this.onDocumentKeyDown, true);
    doc.defaultView?.addEventListener("blur", this.onWindowBlur);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.state.readOnly || this.view.composing) {
      this.cancelDrag();
      this.setHovered(null);
      return;
    }
    if (update.geometryChanged || update.viewportChanged) {
      this.scheduleHandleMeasure();
      if (this.drag?.started) this.scheduleDropMeasure();
    }
  }

  destroy() {
    this.disposed = true;
    this.cancelDrag();
    const doc = this.view.dom.ownerDocument;
    this.view.dom.removeEventListener("pointermove", this.onEditorPointerMove);
    this.view.dom.removeEventListener("pointerleave", this.onEditorPointerLeave);
    this.view.dom.removeEventListener("compositionstart", this.onCompositionStart);
    this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
    this.handle.removeEventListener("pointerdown", this.onHandlePointerDown);
    this.handle.removeEventListener("pointermove", this.onHandlePointerMove);
    this.handle.removeEventListener("pointerup", this.onHandlePointerUp);
    this.handle.removeEventListener("pointercancel", this.onHandlePointerCancel);
    this.handle.removeEventListener("lostpointercapture", this.onLostPointerCapture);
    doc.removeEventListener("keydown", this.onDocumentKeyDown, true);
    doc.defaultView?.removeEventListener("blur", this.onWindowBlur);
    this.view.dom.classList.remove("cm-md-block-drag-enabled", "is-markdown-block-dragging");
    this.layer.remove();
  }

  private readonly onEditorPointerMove = (event: PointerEvent) => {
    if (this.disposed || this.drag || this.view.state.readOnly || this.view.composing) return;
    if (event.target instanceof Element) {
      const nestedInteractiveTarget = event.target.closest(
        "button, input, textarea, select, [contenteditable='true']",
      );
      // CodeMirror's contentDOM is itself contenteditable. It is the primary
      // block hit-test surface, not an embedded control to exclude. Only a
      // genuinely nested interactive widget should suppress the drag handle.
      if (
        nestedInteractiveTarget
        && nestedInteractiveTarget !== this.view.contentDOM
        && !this.handle.contains(event.target)
      ) {
        this.pendingHoverPoint = null;
        this.setHovered(null);
        return;
      }
    }
    this.pendingHoverPoint = { clientX: event.clientX, clientY: event.clientY };
    this.scheduleHoverMeasure();
  };

  private readonly onEditorPointerLeave = () => {
    this.pendingHoverPoint = null;
    if (!this.drag) this.setHovered(null);
  };

  private readonly onCompositionStart = () => {
    this.pendingHoverPoint = null;
    this.cancelDrag();
    this.setHovered(null);
  };

  private readonly onScroll = () => {
    this.scheduleHandleMeasure();
    if (this.drag?.started) this.scheduleDropMeasure();
  };

  private readonly onHandlePointerDown = (event: PointerEvent) => {
    if (
      this.disposed
      || event.button !== 0
      || !this.hovered
      || this.view.state.readOnly
      || this.view.composing
    ) {
      return;
    }
    const group = getMarkdownMovableBlockGroup(this.view.state, this.hovered);
    if (!group || group.blocks.length < 2) return;

    event.preventDefault();
    event.stopPropagation();
    this.view.focus();
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      source: this.hovered,
      sourceIndex: group.sourceIndex,
      blocks: group.blocks,
      startDocument: this.view.state.doc,
      started: false,
      finishing: false,
      boundary: null,
      clientY: event.clientY,
    };
    try {
      this.handle.setPointerCapture(event.pointerId);
    } catch {
      this.cancelDrag();
    }
  };

  private readonly onHandlePointerMove = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.finishing || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    drag.clientY = event.clientY;

    if (!drag.started) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance <= DRAG_THRESHOLD_PX) return;
      drag.started = true;
      this.handle.classList.add("is-dragging");
      this.view.dom.classList.add("is-markdown-block-dragging");
    }

    this.scheduleDropMeasure();
    this.updateAutoscroll();
  };

  private readonly onHandlePointerUp = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.finishing || event.pointerId !== drag.pointerId) return;
    const pointerId = event.pointerId;
    event.preventDefault();
    event.stopPropagation();
    drag.clientY = event.clientY;
    if (!drag.started) {
      this.finishDrag(false);
      return;
    }
    drag.finishing = true;
    this.stopAutoscroll();
    // Coalesce the final hit test through the same DOM read phase. Committing
    // the last measured boundary synchronously here can lag one frame behind a
    // quick pointer release and move the block to the previous target.
    this.view.requestMeasure<DropMeasurement>({
      key: this.dropMeasureKey,
      read: (view) => this.readDropMeasurement(view),
      write: (measurement) => {
        const current = this.drag;
        if (!current || current.pointerId !== pointerId || !current.finishing) return;
        current.boundary = measurement?.boundary ?? null;
        // CodeMirror forbids dispatching while a requestMeasure write phase is
        // still in progress. Commit immediately after that phase so the final
        // hit test stays current without nesting an EditorView update.
        queueMicrotask(() => {
          if (this.disposed || this.drag !== current || !current.finishing) return;
          this.finishDrag(true);
        });
      },
    });
  };

  private readonly onHandlePointerCancel = (event: PointerEvent) => {
    if (this.drag?.pointerId === event.pointerId && !this.drag.finishing) this.cancelDrag();
  };

  private readonly onLostPointerCapture = (event: PointerEvent) => {
    if (this.drag?.pointerId === event.pointerId && !this.drag.finishing) this.cancelDrag();
  };

  private readonly onDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !this.drag) return;
    event.preventDefault();
    event.stopPropagation();
    this.cancelDrag();
    this.view.focus();
  };

  private readonly onWindowBlur = () => this.cancelDrag();

  private setHovered(next: MarkdownMovableBlockRef | null) {
    if (sameMarkdownMovableBlock(this.hovered, next)) return;
    this.hovered = next;
    if (!next) {
      this.handle.classList.remove("is-visible");
      return;
    }
    this.handle.dataset.blockKind = next.kind;
    this.scheduleHandleMeasure();
  }

  private scheduleHoverMeasure() {
    if (this.disposed || !this.pendingHoverPoint || this.drag) return;
    this.view.requestMeasure<MarkdownMovableBlockRef | null>({
      key: this.hoverMeasureKey,
      read: (view) => {
        const point = this.pendingHoverPoint;
        if (!point) return null;
        const contentRect = view.contentDOM.getBoundingClientRect();
        const x = Math.max(contentRect.left + 1, Math.min(point.clientX, contentRect.right - 1));
        const position = view.posAtCoords({ x, y: point.clientY });
        return position == null ? null : getMarkdownMovableBlockAt(view.state, position);
      },
      write: (block) => {
        if (!this.drag && this.pendingHoverPoint) this.setHovered(block);
      },
    });
  }

  private scheduleHandleMeasure() {
    if (this.disposed || !this.hovered || this.drag?.started) return;
    this.view.requestMeasure<HandleMeasurement>({
      key: this.handleMeasureKey,
      read: (view) => {
        const source = this.hovered;
        if (!source || source.to < view.viewport.from || source.from > view.viewport.to) return null;
        const coordinates = view.coordsAtPos(source.from, 1);
        if (!coordinates) return null;
        const rootRect = view.dom.getBoundingClientRect();
        const contentRect = view.contentDOM.getBoundingClientRect();
        const contentStyle = view.dom.ownerDocument.defaultView?.getComputedStyle(view.contentDOM);
        const contentPaddingLeft = Number.parseFloat(contentStyle?.paddingLeft ?? "") || 0;
        const readingRailLeft = contentRect.left + contentPaddingLeft;
        const centerX = Math.max(
          HANDLE_SIZE_PX / 2,
          readingRailLeft - rootRect.left - HANDLE_GAP_PX - HANDLE_SIZE_PX / 2,
        );
        return {
          source,
          left: centerX,
          top: coordinates.top - rootRect.top + (coordinates.bottom - coordinates.top) / 2,
        };
      },
      write: (measurement) => {
        if (!measurement || !sameMarkdownMovableBlock(measurement.source, this.hovered)) {
          this.handle.classList.remove("is-visible");
          return;
        }
        this.handle.style.left = `${measurement.left}px`;
        this.handle.style.top = `${measurement.top}px`;
        this.handle.classList.add("is-visible");
      },
    });
  }

  private scheduleDropMeasure() {
    if (this.disposed || !this.drag?.started) return;
    this.view.requestMeasure<DropMeasurement>({
      key: this.dropMeasureKey,
      read: (view) => this.readDropMeasurement(view),
      write: (measurement) => {
        const drag = this.drag;
        if (!drag?.started || !measurement) {
          this.hideDropIndicator();
          return;
        }
        drag.boundary = measurement.boundary;
        if (!measurement.indicator || isMarkdownBlockMoveNoop(drag.sourceIndex, measurement.boundary)) {
          this.hideDropIndicator();
          return;
        }
        this.indicator.style.left = `${measurement.indicator.left}px`;
        this.indicator.style.top = `${measurement.indicator.top}px`;
        this.indicator.style.width = `${measurement.indicator.width}px`;
        this.indicator.classList.add("is-visible");
      },
    });
  }

  private readDropMeasurement(view: EditorView): DropMeasurement {
    const drag = this.drag;
    if (!drag?.started || view.state.doc !== drag.startDocument) return null;
    const rootRect = view.dom.getBoundingClientRect();
    const candidates: Array<{ index: number; top: number; bottom: number; midpoint: number }> = [];

    const firstVisibleIndex = findFirstVisibleBlockIndex(drag.blocks, view.viewport.from);
    for (let index = firstVisibleIndex; index < drag.blocks.length; index += 1) {
      const block = drag.blocks[index];
      if (block.from > view.viewport.to) break;
      const start = view.coordsAtPos(block.from, 1);
      const end = view.coordsAtPos(block.to, -1);
      if (!start && !end) continue;
      const top = start?.top ?? end!.top;
      const bottom = end?.bottom ?? start!.bottom;
      candidates.push({ index, top, bottom, midpoint: top + (bottom - top) / 2 });
    }
    if (candidates.length === 0) return null;

    let boundary = candidates[candidates.length - 1].index + 1;
    for (const candidate of candidates) {
      if (drag.clientY < candidate.midpoint) {
        boundary = candidate.index;
        break;
      }
    }

    if (isMarkdownBlockMoveNoop(drag.sourceIndex, boundary)) {
      return { boundary, indicator: null };
    }

    const nextCandidate = candidates.find((candidate) => candidate.index === boundary);
    const previousCandidate = [...candidates].reverse().find((candidate) => candidate.index === boundary - 1);
    const top = nextCandidate?.top ?? previousCandidate?.bottom;
    const anchorBlock = boundary < drag.blocks.length
      ? drag.blocks[boundary]
      : drag.blocks[drag.blocks.length - 1];
    const anchorPosition = boundary < drag.blocks.length ? anchorBlock.from : anchorBlock.to;
    const anchor = view.coordsAtPos(anchorPosition, boundary < drag.blocks.length ? 1 : -1);
    if (top == null || !anchor) return { boundary, indicator: null };

    const left = Math.max(16, anchor.left - rootRect.left);
    const contentRect = view.contentDOM.getBoundingClientRect();
    const computedStyle = view.dom.ownerDocument.defaultView?.getComputedStyle(view.contentDOM);
    const paddingRight = Number.parseFloat(computedStyle?.paddingRight ?? "") || 24;
    const readingRailRight = Math.min(rootRect.right - 16, contentRect.right - paddingRight);
    const width = Math.max(48, readingRailRight - anchor.left);
    return {
      boundary,
      indicator: {
        left,
        top: top - rootRect.top,
        width,
      },
    };
  }

  private finishDrag(commit: boolean) {
    const drag = this.drag;
    if (!drag) return;
    const boundary = drag.boundary;
    const shouldCommit = Boolean(
      commit
      && drag.started
      && boundary != null
      && this.view.state.doc === drag.startDocument
      && !this.view.state.readOnly
      && !this.view.composing
    );
    this.clearDragState(drag.pointerId);

    if (shouldCommit && boundary != null) {
      const spec = buildMarkdownBlockMoveTransaction(this.view.state, drag.source, boundary);
      if (spec) this.view.dispatch(spec);
    }
    this.setHovered(null);
  }

  private cancelDrag() {
    const pointerId = this.drag?.pointerId;
    if (pointerId == null) return;
    this.clearDragState(pointerId);
  }

  private clearDragState(pointerId: number) {
    this.drag = null;
    this.stopAutoscroll();
    this.handle.classList.remove("is-dragging");
    this.view.dom.classList.remove("is-markdown-block-dragging");
    this.hideDropIndicator();
    if (this.handle.hasPointerCapture(pointerId)) {
      try {
        this.handle.releasePointerCapture(pointerId);
      } catch {
        // Capture may already have been released by the platform.
      }
    }
  }

  private hideDropIndicator() {
    this.indicator.classList.remove("is-visible");
  }

  private updateAutoscroll() {
    const drag = this.drag;
    const ownerWindow = this.view.dom.ownerDocument.defaultView;
    if (!drag?.started || !ownerWindow || this.autoscrollFrame != null) return;

    const step = () => {
      this.autoscrollFrame = null;
      const currentDrag = this.drag;
      if (!currentDrag?.started) return;
      const rect = this.view.scrollDOM.getBoundingClientRect();
      const delta = getEdgeScrollDelta(currentDrag.clientY, rect.top, rect.bottom);
      if (delta === 0) return;
      const previousTop = this.view.scrollDOM.scrollTop;
      this.view.scrollDOM.scrollTop += delta;
      if (this.view.scrollDOM.scrollTop !== previousTop) this.scheduleDropMeasure();
      this.autoscrollFrame = ownerWindow.requestAnimationFrame(step);
    };

    this.autoscrollFrame = ownerWindow.requestAnimationFrame(step);
  }

  private stopAutoscroll() {
    if (this.autoscrollFrame == null) return;
    this.view.dom.ownerDocument.defaultView?.cancelAnimationFrame(this.autoscrollFrame);
    this.autoscrollFrame = null;
  }
}

const markdownBlockDragPlugin = ViewPlugin.fromClass(MarkdownBlockDragController);

export function markdownBlockDragExtension(): Extension {
  return [
    keymap.of([
      { key: "Mod-Shift-ArrowUp", run: (view) => moveMarkdownBlock(view, "up") },
      { key: "Mod-Shift-ArrowDown", run: (view) => moveMarkdownBlock(view, "down") },
    ]),
    markdownBlockDragPlugin,
  ];
}

function getEdgeScrollDelta(clientY: number, top: number, bottom: number): number {
  if (clientY < top + EDGE_SCROLL_ZONE_PX) {
    const ratio = Math.min(1, Math.max(0, (top + EDGE_SCROLL_ZONE_PX - clientY) / EDGE_SCROLL_ZONE_PX));
    return -Math.max(1, Math.round(MAX_EDGE_SCROLL_PX * ratio));
  }
  if (clientY > bottom - EDGE_SCROLL_ZONE_PX) {
    const ratio = Math.min(1, Math.max(0, (clientY - (bottom - EDGE_SCROLL_ZONE_PX)) / EDGE_SCROLL_ZONE_PX));
    return Math.max(1, Math.round(MAX_EDGE_SCROLL_PX * ratio));
  }
  return 0;
}

function findFirstVisibleBlockIndex(
  blocks: readonly MarkdownMovableBlockRef[],
  viewportFrom: number,
): number {
  let low = 0;
  let high = blocks.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (blocks[middle].to < viewportFrom) low = middle + 1;
    else high = middle;
  }
  return low;
}
