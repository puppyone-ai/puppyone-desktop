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

export type DocumentSurfaceState = "committed" | "staging";

const DocumentSurfaceStateContext = createContext<DocumentSurfaceState>("committed");

/** Lets native/portal renderers stage offscreen and reveal atomically with the DOM slot. */
export function useDocumentSurfaceState(): DocumentSurfaceState {
  return useContext(DocumentSurfaceStateContext);
}

export type DocumentSurfaceRenderControls = Readonly<{
  onSurfaceReady: () => void;
}>;

export type DocumentSurfaceHostProps = {
  surfaceKey: string;
  children: (controls: DocumentSurfaceRenderControls) => ReactNode;
};

type SurfaceEntry = {
  id: number;
  key: string;
  render: DocumentSurfaceHostProps["children"];
};

type DocumentSurfaceHostState = {
  requestedKey: string;
  committed: SurfaceEntry;
  staging: SurfaceEntry | null;
  nextId: number;
};

/**
 * Owns the one transition invariant shared by every document renderer: the
 * committed surface stays visible and interactive until the requested surface
 * reports a paint-ready frame. A replacement request discards the previous
 * staging slot, so a late readiness signal can never commit stale content.
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
        render: props.children,
      },
      staging: null,
      nextId: 1,
    };
  }

  static getDerivedStateFromProps(
    props: DocumentSurfaceHostProps,
    state: DocumentSurfaceHostState,
  ): Partial<DocumentSurfaceHostState> | null {
    if (props.surfaceKey === state.requestedKey) {
      if (state.staging?.key === props.surfaceKey) {
        if (state.staging.render === props.children) return null;
        return {
          staging: { ...state.staging, render: props.children },
        };
      }

      if (state.committed.key === props.surfaceKey) {
        if (state.committed.render === props.children) return null;
        return {
          committed: { ...state.committed, render: props.children },
        };
      }

      return null;
    }

    // A quick A -> B -> A selection cancels B and reuses the still-mounted A
    // surface instead of creating a duplicate staging editor.
    if (props.surfaceKey === state.committed.key) {
      return {
        requestedKey: props.surfaceKey,
        committed: { ...state.committed, render: props.children },
        staging: null,
      };
    }

    return {
      requestedKey: props.surfaceKey,
      staging: {
        id: state.nextId,
        key: props.surfaceKey,
        render: props.children,
      },
      nextId: state.nextId + 1,
    };
  }

  private markReady = (entryId: number) => {
    this.setState((state) => {
      if (!state.staging || state.staging.id !== entryId) return null;
      return {
        committed: state.staging,
        staging: null,
      };
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
