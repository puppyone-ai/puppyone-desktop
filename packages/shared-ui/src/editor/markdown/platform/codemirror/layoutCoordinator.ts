import type { EditorView } from "@codemirror/view";

const GEOMETRY_CHANGE_THRESHOLD_PX = 0.75;

export type MarkdownLayoutCoordinator = {
  observe(element: HTMLElement): () => void;
  request(): void;
  dispose(): void;
};

/**
 * One geometry observer and one keyed CodeMirror measure queue per EditorView.
 * Widget sessions register DOM nodes here; they never own independent frame
 * schedulers or call layout APIs from ResizeObserver callbacks.
 */
export function createMarkdownLayoutCoordinator(view: EditorView): MarkdownLayoutCoordinator {
  const lastHeightByElement = new WeakMap<HTMLElement, number>();
  const observedElements = new Set<HTMLElement>();
  const measureKey = {};
  let disposed = false;

  const request = () => {
    if (disposed) return;
    try {
      view.requestMeasure({
        key: measureKey,
        read: () => undefined,
      });
    } catch {
      // The view may have been destroyed between an async completion and its
      // session cleanup. Disposal remains idempotent.
    }
  };

  const observer = typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver((entries) => {
        let geometryChanged = false;
        for (const entry of entries) {
          const element = entry.target as HTMLElement;
          if (!observedElements.has(element)) continue;
          const height = entry.contentRect.height;
          const previousHeight = lastHeightByElement.get(element);
          lastHeightByElement.set(element, height);
          if (
            previousHeight === undefined
            || Math.abs(height - previousHeight) >= GEOMETRY_CHANGE_THRESHOLD_PX
          ) {
            geometryChanged = true;
          }
        }
        if (geometryChanged) request();
      });

  const coordinator: MarkdownLayoutCoordinator = {
    observe(element) {
      if (disposed) return () => undefined;
      observedElements.add(element);
      lastHeightByElement.delete(element);
      observer?.observe(element);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        observedElements.delete(element);
        lastHeightByElement.delete(element);
        observer?.unobserve(element);
      };
    },
    request,
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      observedElements.clear();
    },
  };

  return coordinator;
}

/** DOM-session facade that makes unregistration deterministic. */
export class MarkdownWidgetMeasureController {
  private stopObserving: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly coordinator: MarkdownLayoutCoordinator) {}

  get destroyed(): boolean {
    return this.disposed;
  }

  observe(element: HTMLElement) {
    this.stopObserving?.();
    this.stopObserving = this.coordinator.observe(element);
  }

  schedule() {
    if (!this.disposed) this.coordinator.request();
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopObserving?.();
    this.stopObserving = null;
  }
}
