import type { EditorView } from "@codemirror/view";

const GEOMETRY_CHANGE_THRESHOLD_PX = 0.75;

export type MarkdownLayoutCoordinator = {
  observe(element: HTMLElement, onHeightChange?: (height: number, previousHeight: number | null) => void): () => void;
  schedule<T>(key: object, read: () => T, write: (value: T) => void): void;
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
  const heightChangeByElement = new WeakMap<HTMLElement, (height: number, previousHeight: number | null) => void>();
  const pendingHeightChanges = new Map<HTMLElement, { height: number; previousHeight: number | null }>();
  const observedElements = new Set<HTMLElement>();
  const measureKey = {};
  const heightMeasureKey = {};
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
            const callback = heightChangeByElement.get(element);
            if (callback) {
              pendingHeightChanges.set(element, {
                height,
                previousHeight: previousHeight ?? null,
              });
            }
          }
        }
        if (pendingHeightChanges.size > 0) {
          try {
            view.requestMeasure({
              key: heightMeasureKey,
              read: () => {
                const pending = Array.from(pendingHeightChanges.entries());
                pendingHeightChanges.clear();
                return pending;
              },
              write: (pending) => {
                for (const [element, change] of pending) {
                  if (!observedElements.has(element)) continue;
                  heightChangeByElement.get(element)?.(change.height, change.previousHeight);
                }
              },
            });
          } catch {
            pendingHeightChanges.clear();
          }
        }
        if (geometryChanged) request();
      });

  const coordinator: MarkdownLayoutCoordinator = {
    observe(element, onHeightChange) {
      if (disposed) return () => undefined;
      observedElements.add(element);
      lastHeightByElement.delete(element);
      if (onHeightChange) heightChangeByElement.set(element, onHeightChange);
      observer?.observe(element);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        observedElements.delete(element);
        lastHeightByElement.delete(element);
        heightChangeByElement.delete(element);
        pendingHeightChanges.delete(element);
        observer?.unobserve(element);
      };
    },
    schedule(key, read, write) {
      if (disposed) return;
      try {
        view.requestMeasure({ key, read, write });
      } catch {
        // The view may be between async disposal and DOM cleanup.
      }
    },
    request,
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      observedElements.clear();
      pendingHeightChanges.clear();
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
