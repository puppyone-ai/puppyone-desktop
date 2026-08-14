import type { DesktopEditorWorkbenchState } from "./editorWorkbenchStorage";

export const EDITOR_WORKBENCH_PERSISTENCE_DELAY_MS = 200;

type PendingWorkbenchWrite = {
  state: DesktopEditorWorkbenchState;
  storageKey: string;
};

/** Coalesces non-document session metadata. Document durability is handled by
 * Working Copies; this scheduler prevents focus and resize metadata from doing
 * synchronous storage work on every interaction frame. */
export class EditorWorkbenchPersistenceScheduler {
  private pending: PendingWorkbenchWrite | null = null;
  private timerId: number | null = null;

  constructor(
    private readonly storage: Pick<Storage, "setItem">,
    private readonly timerHost: Pick<Window, "setTimeout" | "clearTimeout">,
    private readonly delayMs = EDITOR_WORKBENCH_PERSISTENCE_DELAY_MS,
  ) {}

  schedule(storageKey: string, state: DesktopEditorWorkbenchState): void {
    if (this.pending && this.pending.storageKey !== storageKey) this.flush();
    this.pending = { storageKey, state };
    if (this.timerId !== null) this.timerHost.clearTimeout(this.timerId);
    this.timerId = this.timerHost.setTimeout(() => {
      this.timerId = null;
      this.writePending();
    }, this.delayMs);
  }

  flush(): void {
    if (this.timerId !== null) {
      this.timerHost.clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.writePending();
  }

  private writePending(): void {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    try {
      this.storage.setItem(pending.storageKey, JSON.stringify(pending.state));
    } catch {
      // Session restoration metadata is best-effort and must never block editing.
    }
  }
}
