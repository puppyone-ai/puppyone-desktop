import type { SourceRange } from "../../plans/markdownPlanTypes";

export type EmbeddedEditSession = {
  elementId: string;
  featureId: string;
  mappedRange: SourceRange;
  baseSource: string;
  baseRevision: string;
  draft: unknown;
  mode: "preview" | "editing" | "source";
  focusTarget?: unknown;
};

/**
 * Per-view recoverable embed edit sessions. DOM sessions may mirror this state
 * but must not be the only owner of an uncommitted draft.
 */
export function createEmbeddedEditSessionStore() {
  const sessions = new Map<string, EmbeddedEditSession>();

  return {
    get(elementId: string): EmbeddedEditSession | undefined {
      return sessions.get(elementId);
    },
    set(session: EmbeddedEditSession) {
      sessions.set(session.elementId, session);
    },
    update(elementId: string, patch: Partial<EmbeddedEditSession>) {
      const current = sessions.get(elementId);
      if (!current) return null;
      const next = { ...current, ...patch };
      sessions.set(elementId, next);
      return next;
    },
    delete(elementId: string) {
      sessions.delete(elementId);
    },
    mapRanges(mapPos: (pos: number, assoc?: number) => number) {
      for (const [id, session] of sessions) {
        sessions.set(id, {
          ...session,
          mappedRange: {
            from: mapPos(session.mappedRange.from, 1),
            to: mapPos(session.mappedRange.to, -1),
          },
        });
      }
    },
    clear() {
      sessions.clear();
    },
    values() {
      return Array.from(sessions.values());
    },
  };
}

export type EmbeddedEditSessionStore = ReturnType<typeof createEmbeddedEditSessionStore>;
