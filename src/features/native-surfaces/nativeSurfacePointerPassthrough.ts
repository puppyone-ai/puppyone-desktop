export type NativeSurfacePointerPassthroughOwner =
  | "auxiliary-panel-resize"
  | "editor-pane-move"
  | "editor-split-resize"
  | "explorer-file-drop"
  | "explorer-resize"
  | "terminal-split-resize"
  | "terminal-tab-move";

export type NativeSurfacePointerPassthroughLease = Readonly<{
  owner: NativeSurfacePointerPassthroughOwner;
  sessionId: string;
  release: () => void;
}>;

type ActiveLease = Readonly<{
  owner: NativeSurfacePointerPassthroughOwner;
  sessionId: string;
}>;

const activeLeases = new Map<string, ActiveLease>();
let nextLeaseId = 1;
let publishedActive = false;

/**
 * Acquires pointer forwarding for one interaction session. The returned
 * release function is idempotent and can only release its own lease.
 */
export function acquireNativeSurfacePointerPassthroughLease(
  owner: NativeSurfacePointerPassthroughOwner,
  sessionId = createNativeSurfacePointerSessionId(owner),
): NativeSurfacePointerPassthroughLease {
  const leaseId = `${owner}:${sessionId}:${nextLeaseId++}`;
  let released = false;
  activeLeases.set(leaseId, { owner, sessionId });
  publishActiveState();

  return {
    owner,
    sessionId,
    release: () => {
      if (released) return;
      released = true;
      activeLeases.delete(leaseId);
      publishActiveState();
    },
  };
}

export function createNativeSurfacePointerSessionId(
  owner: NativeSurfacePointerPassthroughOwner,
): string {
  return `${owner}-${Date.now().toString(36)}-${nextLeaseId++}`;
}

function publishActiveState(): void {
  const nextActive = activeLeases.size > 0;
  if (publishedActive === nextActive) return;
  publishedActive = nextActive;
  const publish = window.puppyoneDesktop?.setNativeSurfacePointerPassthrough;
  if (typeof publish === "function") publish({ active: nextActive });
}
