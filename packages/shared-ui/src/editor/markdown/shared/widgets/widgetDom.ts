import type { EditorView } from "@codemirror/view";

export function stopCodeMirrorEvent(event: Event) {
  event.stopPropagation();
}

export function hasPointerMoved(event: MouseEvent, pointerDown: { x: number; y: number }): boolean {
  return Math.abs(event.clientX - pointerDown.x) > 4 || Math.abs(event.clientY - pointerDown.y) > 4;
}

/**
 * Resolve a mounted replacement widget back to its current document range.
 *
 * CodeMirror maps decoration positions through every transaction, while a
 * reused WidgetType descriptor remains immutable. Interactive widgets must
 * therefore read their current position from the mounted DOM instead of
 * retaining absolute offsets captured at construction time.
 */
export function getMappedWidgetSourceRange(
  view: EditorView,
  element: HTMLElement,
  sourceLength: number,
): { from: number; to: number } | null {
  try {
    const from = view.posAtDOM(element, 0);
    return {
      from,
      to: Math.min(view.state.doc.length, from + Math.max(0, sourceLength)),
    };
  } catch {
    // CodeMirror may detach a widget between pointer delivery and dispatch.
    return null;
  }
}

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export function isContentEditableCaretAtBoundary(element: HTMLElement, boundary: "start" | "end"): boolean {
  const selection = element.ownerDocument.getSelection();
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false;
  const anchorNode = selection.anchorNode;
  if (!anchorNode || !element.contains(anchorNode)) return false;

  const range = selection.getRangeAt(0).cloneRange();
  const contentRange = element.ownerDocument.createRange();
  contentRange.selectNodeContents(element);

  if (boundary === "start") {
    contentRange.setEnd(range.startContainer, range.startOffset);
    return contentRange.toString().length === 0;
  }

  contentRange.setStart(range.endContainer, range.endOffset);
  return contentRange.toString().length === 0;
}
