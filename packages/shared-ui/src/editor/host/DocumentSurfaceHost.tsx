"use client";

import {
  Component,
  createContext,
  useEffect,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import type { ViewerSurfacePreparation } from "../registry/viewerContract";

export type DocumentSurfaceState = "committed" | "staging";

const DocumentSurfaceStateContext = createContext<DocumentSurfaceState>("committed");

/** Lets native/portal renderers stage offscreen and reveal atomically with the DOM slot. */
export function useDocumentSurfaceState(): DocumentSurfaceState {
  return useContext(DocumentSurfaceStateContext);
}

export type DocumentSurfaceRenderControls = Readonly<{
  onSurfaceReady: () => void;
}>;

/**
 * A non-visual readiness signal for document renderers. File transitions keep
 * the committed surface on screen, so pending renderers must report their busy
 * state without introducing a second, viewer-specific loading page.
 */
export function DocumentSurfacePending({ label }: { label: string }) {
  return (
    <div
      className="document-surface-pending"
      role="status"
      aria-busy="true"
      aria-label={label}
    />
  );
}

export type DocumentSurfaceHostProps = {
  surfaceKey: string;
  /**
   * Hidden-safe surfaces preserve the previous document until ready. A
   * requires-visible surface becomes the committed layout slot immediately so
   * its renderer can measure and produce a trustworthy first frame.
   */
  surfacePreparation?: ViewerSurfacePreparation;
  children: (controls: DocumentSurfaceRenderControls) => ReactNode;
};

type SurfaceEntry = {
  id: number;
  key: string;
  preparation: ViewerSurfacePreparation;
  render: DocumentSurfaceHostProps["children"];
};

type DocumentSurfaceHostState = {
  requestedKey: string;
  committed: SurfaceEntry;
  staging: SurfaceEntry | null;
  committedReady: boolean;
  nextId: number;
};

/**
 * Owns the one transition invariant shared by every document renderer: the
 * hidden-safe renderers keep the committed surface visible until their staged
 * replacement reports ready. Renderers that need a real layout box are
 * committed immediately and never initialized under visibility:hidden. A late
 * readiness signal can never commit stale content.
 */
export class DocumentSurfaceHost extends Component<
  DocumentSurfaceHostProps,
  DocumentSurfaceHostState
> {
  constructor(props: DocumentSurfaceHostProps) {
    super(props);
    this.state = {
      requestedKey: props.surfaceKey,
      committed: {
        id: 0,
        key: props.surfaceKey,
        preparation: props.surfacePreparation ?? "hidden-safe",
        render: props.children,
      },
      staging: null,
      committedReady: false,
      nextId: 1,
    };
  }

  static getDerivedStateFromProps(
    props: DocumentSurfaceHostProps,
    state: DocumentSurfaceHostState,
  ): Partial<DocumentSurfaceHostState> | null {
    const preparation = props.surfacePreparation ?? "hidden-safe";
    if (props.surfaceKey === state.requestedKey) {
      if (state.staging?.key === props.surfaceKey) {
        if (
          state.staging.render === props.children
          && state.staging.preparation === preparation
        ) return null;
        return {
          staging: { ...state.staging, preparation, render: props.children },
        };
      }

      if (state.committed.key === props.surfaceKey) {
        if (
          state.committed.render === props.children
          && state.committed.preparation === preparation
        ) return null;
        return {
          committed: { ...state.committed, preparation, render: props.children },
        };
      }

      return null;
    }

    // A quick A -> B -> A selection cancels B and reuses the still-mounted A
    // surface instead of creating a duplicate staging editor.
    if (props.surfaceKey === state.committed.key) {
      return {
        requestedKey: props.surfaceKey,
        committed: { ...state.committed, preparation, render: props.children },
        staging: null,
      };
    }

    if (preparation === "requires-visible") {
      return {
        requestedKey: props.surfaceKey,
        committed: {
          id: state.nextId,
          key: props.surfaceKey,
          preparation,
          render: props.children,
        },
        staging: null,
        committedReady: false,
        nextId: state.nextId + 1,
      };
    }

    return {
      requestedKey: props.surfaceKey,
      staging: {
        id: state.nextId,
        key: props.surfaceKey,
        preparation,
        render: props.children,
      },
      nextId: state.nextId + 1,
    };
  }

  private markReady = (entryId: number) => {
    this.setState((state) => {
      if (state.staging?.id === entryId) {
        return {
          committed: state.staging,
          staging: null,
          committedReady: true,
        };
      }
      if (state.committed.id === entryId && !state.committedReady) {
        return {
          committed: state.committed,
          staging: state.staging,
          committedReady: true,
        };
      }
      return null;
    });
  };

  private setSlotElementState(element: HTMLDivElement | null, staging: boolean) {
    if (element) element.inert = staging;
  }

  private renderEntry(entry: SurfaceEntry, staging: boolean) {
    return (
      <div
        key={entry.id}
        ref={(element) => this.setSlotElementState(element, staging)}
        className={`document-surface-slot ${staging ? "is-staging" : "is-committed"}`}
        data-surface-key={entry.key}
        data-surface-state={staging ? "staging" : "committed"}
        data-surface-preparation={entry.preparation}
        data-surface-ready={!staging && this.state.committedReady ? "true" : "false"}
        aria-hidden={staging || undefined}
      >
        <DocumentSurfaceStateContext.Provider value={staging ? "staging" : "committed"}>
          {entry.render({ onSurfaceReady: () => this.markReady(entry.id) })}
        </DocumentSurfaceStateContext.Provider>
      </div>
    );
  }

  render() {
    const { committed, staging } = this.state;
    return (
      <div
        className="document-surface-host"
        data-transitioning={staging ? "true" : "false"}
        data-surface-preparation={committed.preparation}
      >
        {this.renderEntry(committed, false)}
        {staging ? this.renderEntry(staging, true) : null}
      </div>
    );
  }
}

export function DocumentSurfaceReadinessBoundary({
  readinessKey,
  onReady,
  children,
}: {
  readinessKey: string;
  onReady?: (() => void) | null;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const readinessEnabled = Boolean(onReady);

  useLayoutEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (!readinessEnabled) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;

    let cancelled = false;
    let frame: number | null = null;
    let stableFrames = 0;
    let reported = false;

    const scheduleCheck = () => {
      if (cancelled || reported || frame !== null) return;
      frame = window.requestAnimationFrame(checkReadiness);
    };
    const checkReadiness = () => {
      frame = null;
      if (cancelled || reported) return;
      if (root.querySelector('[aria-busy="true"]')) {
        stableFrames = 0;
        return;
      }

      stableFrames += 1;
      if (stableFrames < 2) {
        scheduleCheck();
        return;
      }

      reported = true;
      onReadyRef.current?.();
    };
    const observer = new MutationObserver(() => {
      stableFrames = 0;
      scheduleCheck();
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["aria-busy"],
      childList: true,
      subtree: true,
    });
    scheduleCheck();

    return () => {
      cancelled = true;
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [readinessEnabled, readinessKey]);

  return (
    <div ref={rootRef} className="document-surface-readiness-boundary">
      {children}
    </div>
  );
}
