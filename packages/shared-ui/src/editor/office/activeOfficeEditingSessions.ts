type OfficeSessionRegistration = {
  tokens: Set<symbol>;
  flush: () => Promise<void>;
  retirementTimer: ReturnType<typeof setTimeout> | null;
};

const registrations = new Map<string, OfficeSessionRegistration>();

/** Retains a recently unmounted external editor until its asynchronous final save has had time to land. */
export function registerActiveOfficeEditingSession(
  sessionId: string,
  flush: () => Promise<void>,
): () => void {
  let registration = registrations.get(sessionId);
  if (!registration) {
    registration = { tokens: new Set(), flush, retirementTimer: null };
    registrations.set(sessionId, registration);
  }
  registration.flush = flush;
  if (registration.retirementTimer) clearTimeout(registration.retirementTimer);
  registration.retirementTimer = null;
  const token = Symbol(sessionId);
  registration.tokens.add(token);

  return () => {
    const current = registrations.get(sessionId);
    if (!current) return;
    current.tokens.delete(token);
    if (current.tokens.size > 0) return;
    current.retirementTimer = setTimeout(() => {
      if (registrations.get(sessionId) === current && current.tokens.size === 0) {
        registrations.delete(sessionId);
      }
    }, 2 * 60 * 1000);
  };
}

/** App-close durability barrier for active and recently detached Office editors. */
export async function flushActiveOfficeEditingSessions(): Promise<void> {
  const entries = [...registrations.entries()];
  const results = await Promise.allSettled(entries.map(([, registration]) => registration.flush()));
  const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
  entries.forEach(([sessionId, registration], index) => {
    if (results[index]?.status !== "fulfilled" || registration.tokens.size > 0) return;
    if (registrations.get(sessionId) === registration) registrations.delete(sessionId);
  });
  if (failures.length > 0) {
    throw new AggregateError(failures, `Unable to save ${failures.length} open Office document${failures.length === 1 ? "" : "s"}.`);
  }
}
