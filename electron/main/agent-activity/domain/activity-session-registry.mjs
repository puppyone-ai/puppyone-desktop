export function createActivitySessionRegistry() {
  const sessions = new Map();

  function register(value) {
    validateSession(value);
    const session = Object.freeze({ ...value });
    sessions.set(session.terminalSessionId, session);
    return session;
  }

  return Object.freeze({
    register,
    get: (terminalSessionId) => sessions.get(terminalSessionId) ?? null,
    delete: (terminalSessionId) => sessions.delete(terminalSessionId),
    clear: () => sessions.clear(),
    values: () => Array.from(sessions.values()),
  });
}

function validateSession(value) {
  if (!value || typeof value !== "object") throw new TypeError("Activity session is required.");
  if (typeof value.terminalSessionId !== "string" || !value.terminalSessionId) {
    throw new TypeError("Activity terminal session id is required.");
  }
  if (typeof value.providerId !== "string" || !value.providerId) {
    throw new TypeError("Activity provider id is required.");
  }
  if (typeof value.workspaceRoot !== "string" || !value.workspaceRoot) {
    throw new TypeError("Activity workspace root is required.");
  }
  if (!Number.isInteger(value.webContentsId) || value.webContentsId <= 0) {
    throw new TypeError("Activity owner window is required.");
  }
}
