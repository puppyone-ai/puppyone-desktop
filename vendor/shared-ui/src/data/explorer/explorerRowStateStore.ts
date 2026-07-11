export type ExplorerRowDropState = {
  rowPath: string | null;
  mode: "folder" | "parent";
  valid: boolean;
} | null;

export type ExplorerRowStateSources = {
  activePath: string | null;
  selectedPaths: ReadonlySet<string>;
  cutPaths: ReadonlySet<string>;
  loadingPaths: ReadonlySet<string>;
  draggedPaths: ReadonlySet<string>;
  dropTarget: ExplorerRowDropState;
};

export type ExplorerRowInteractionState = {
  active: boolean;
  selected: boolean;
  cut: boolean;
  loading: boolean;
  dragging: boolean;
  dropOver: boolean;
  dropParentOver: boolean;
  dropInvalid: boolean;
};

const EMPTY_PATH_SET: ReadonlySet<string> = new Set();
const EMPTY_SOURCES: ExplorerRowStateSources = {
  activePath: null,
  selectedPaths: EMPTY_PATH_SET,
  cutPaths: EMPTY_PATH_SET,
  loadingPaths: EMPTY_PATH_SET,
  draggedPaths: EMPTY_PATH_SET,
  dropTarget: null,
};

/**
 * A path-addressed external store. Explorer rows subscribe only to their own
 * primitive interaction state, so a normal single selection notifies exactly
 * the previously selected row and the newly selected row.
 */
export class ExplorerRowStateStore {
  private sources: ExplorerRowStateSources = EMPTY_SOURCES;
  private readonly snapshots = new Map<string, ExplorerRowInteractionState>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private pendingNotifications = new Set<string>();

  prepare(next: ExplorerRowStateSources, visiblePaths: Iterable<string>) {
    const previous = this.sources;
    const affected = new Set<string>();

    addPath(affected, previous.activePath);
    addPath(affected, next.activePath);
    addSetDifference(affected, previous.selectedPaths, next.selectedPaths);
    addSetDifference(affected, next.selectedPaths, previous.selectedPaths);
    addSetDifference(affected, previous.loadingPaths, next.loadingPaths);
    addSetDifference(affected, next.loadingPaths, previous.loadingPaths);
    addSetDifference(affected, previous.draggedPaths, next.draggedPaths);
    addSetDifference(affected, next.draggedPaths, previous.draggedPaths);
    addPath(affected, previous.dropTarget?.rowPath ?? null);
    addPath(affected, next.dropTarget?.rowPath ?? null);

    if (previous.cutPaths !== next.cutPaths) {
      for (const path of visiblePaths) {
        if (isPathInSetOrDescendant(path, previous.cutPaths) !== isPathInSetOrDescendant(path, next.cutPaths)) {
          affected.add(path);
        }
      }
    }

    this.sources = next;
    for (const path of affected) {
      const previousSnapshot = this.snapshots.get(path) ?? createSnapshot(path, previous);
      const nextSnapshot = createSnapshot(path, next);
      if (equalSnapshot(previousSnapshot, nextSnapshot)) continue;
      this.snapshots.set(path, nextSnapshot);
      this.pendingNotifications.add(path);
    }
  }

  flush() {
    if (this.pendingNotifications.size === 0) return;
    const paths = this.pendingNotifications;
    this.pendingNotifications = new Set();
    for (const path of paths) {
      for (const listener of this.listeners.get(path) ?? []) listener();
    }
  }

  getSnapshot(path: string): ExplorerRowInteractionState {
    const existing = this.snapshots.get(path);
    if (existing) return existing;
    const snapshot = createSnapshot(path, this.sources);
    this.snapshots.set(path, snapshot);
    return snapshot;
  }

  subscribe(path: string, listener: () => void): () => void {
    const pathListeners = this.listeners.get(path) ?? new Set<() => void>();
    pathListeners.add(listener);
    this.listeners.set(path, pathListeners);
    return () => {
      pathListeners.delete(listener);
      if (pathListeners.size === 0) this.listeners.delete(path);
    };
  }

  /** Test/benchmark diagnostic; never used to drive product behavior. */
  getPendingNotificationPaths(): readonly string[] {
    return [...this.pendingNotifications];
  }
}

function createSnapshot(path: string, sources: ExplorerRowStateSources): ExplorerRowInteractionState {
  const dropMatchesRow = sources.dropTarget?.rowPath === path;
  return {
    active: sources.activePath === path,
    selected: sources.selectedPaths.has(path),
    cut: isPathInSetOrDescendant(path, sources.cutPaths),
    loading: sources.loadingPaths.has(path),
    dragging: sources.draggedPaths.has(path),
    dropOver: Boolean(dropMatchesRow && sources.dropTarget?.mode === "folder" && sources.dropTarget.valid),
    dropParentOver: Boolean(dropMatchesRow && sources.dropTarget?.mode === "parent" && sources.dropTarget.valid),
    dropInvalid: Boolean(dropMatchesRow && !sources.dropTarget?.valid),
  };
}

function equalSnapshot(left: ExplorerRowInteractionState, right: ExplorerRowInteractionState): boolean {
  return left.active === right.active
    && left.selected === right.selected
    && left.cut === right.cut
    && left.loading === right.loading
    && left.dragging === right.dragging
    && left.dropOver === right.dropOver
    && left.dropParentOver === right.dropParentOver
    && left.dropInvalid === right.dropInvalid;
}

function addPath(target: Set<string>, path: string | null) {
  if (path) target.add(path);
}

function addSetDifference(
  target: Set<string>,
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
) {
  if (left === right) return;
  for (const path of left) {
    if (!right.has(path)) target.add(path);
  }
}

function isPathInSetOrDescendant(path: string, paths: ReadonlySet<string>): boolean {
  for (const candidate of paths) {
    if (path === candidate || path.startsWith(`${candidate}/`)) return true;
  }
  return false;
}
