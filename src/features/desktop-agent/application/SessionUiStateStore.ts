export type SessionUiState = {
  draft: string;
  scrollTop: number;
  measurements: Record<string, number>;
  pinned: boolean;
};

const EMPTY_SESSION_UI: Readonly<SessionUiState> = Object.freeze({
  draft: "",
  scrollTop: 0,
  measurements: Object.freeze({}),
  pinned: true,
});

/** Renderer-only ephemeral state keyed by application session id. */
export class SessionUiStateStore {
  private readonly entries = new Map<string, SessionUiState>();

  read(key: string): SessionUiState {
    const value = this.entries.get(key) ?? EMPTY_SESSION_UI;
    return { ...value, measurements: { ...value.measurements } };
  }

  patch(key: string, value: Partial<SessionUiState>) {
    const current = this.read(key);
    this.entries.set(key, {
      ...current,
      ...value,
      measurements: value.measurements ? { ...value.measurements } : current.measurements,
    });
  }

  delete(key: string) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }
}
