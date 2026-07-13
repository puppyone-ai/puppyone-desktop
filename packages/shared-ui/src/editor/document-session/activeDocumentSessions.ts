import type { EditorDocumentSession } from "./types";

type SessionRegistration = {
  tokens: Set<symbol>;
};

// Empty-token entries are retiring sessions whose final unmount snapshot has
// not yet been acknowledged. They remain part of an app-close drain.
const registeredDocumentSessions = new Map<EditorDocumentSession, SessionRegistration>();

/** Register a host-owned session for the lifetime of its React boundary. */
export function registerActiveDocumentSession(session: EditorDocumentSession): () => void {
  let registration = registeredDocumentSessions.get(session);
  if (!registration) {
    registration = { tokens: new Set() };
    registeredDocumentSessions.set(session, registration);
  }
  const token = Symbol(session.documentId);
  registration.tokens.add(token);
  let registered = true;

  return () => {
    if (!registered) return;
    registered = false;
    registration!.tokens.delete(token);

    // React runs the remaining child cleanups before this microtask. Deferring
    // observes the final destroy snapshot and also makes StrictMode's
    // cleanup/setup probe safe: a replacement token prevents retirement.
    void Promise.resolve().then(() => retireRegistration(session, registration!));
  };
}

/**
 * Snapshot and drain every active or retiring session owned by this renderer
 * window. The main process awaits this promise before BrowserWindow teardown.
 */
export async function flushActiveDocumentSessions(): Promise<void> {
  const sessions = [...registeredDocumentSessions.keys()];
  const results = await Promise.allSettled(
    sessions.map((session) => Promise.resolve().then(
      () => session.flushCurrent("app-close"),
    )),
  );
  const failures = results.flatMap((result) => (
    result.status === "rejected" ? [result.reason] : []
  ));

  sessions.forEach((session, index) => {
    if (results[index]?.status !== "fulfilled") return;
    pruneRetiredSession(session);
  });

  if (failures.length > 0) {
    const detail = failures
      .map((failure) => failure instanceof Error ? failure.message : String(failure))
      .filter(Boolean)
      .slice(0, 3)
      .join("; ");
    throw new AggregateError(
      failures,
      `Unable to save ${failures.length} open document${failures.length === 1 ? "" : "s"}:${detail ? ` ${detail}` : ""}`,
    );
  }
}

async function retireRegistration(
  session: EditorDocumentSession,
  registration: SessionRegistration,
): Promise<void> {
  if (registeredDocumentSessions.get(session) !== registration || registration.tokens.size > 0) {
    return;
  }
  if (!session.hasUnpersistedChanges()) {
    registeredDocumentSessions.delete(session);
    return;
  }

  try {
    await session.flushCurrent("destroy");
  } catch {
    // Keep a failed retiring session registered. A later app-close drain must
    // surface the unresolved write instead of silently forgetting it.
    return;
  }
  pruneRetiredSession(session);
}

function pruneRetiredSession(session: EditorDocumentSession): void {
  const registration = registeredDocumentSessions.get(session);
  if (
    registration
    && registration.tokens.size === 0
    && !session.hasUnpersistedChanges()
  ) {
    registeredDocumentSessions.delete(session);
  }
}
