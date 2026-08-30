/**
 * Joins process-local replay events with a durable metadata-only native-session
 * catalog. The event cache wins while the process is alive; the catalog is the
 * restart boundary and never receives transcript payloads.
 */
export function createAgentSessionRepository({ eventCache, conversationCatalog }) {
  if (!eventCache?.save || !conversationCatalog?.save) {
    throw new TypeError("Agent session repository requires an event cache and conversation catalog.");
  }
  return {
    async save(record) {
      await Promise.all([eventCache.save(record), conversationCatalog.save(record)]);
    },
    upsertNative(record) {
      return conversationCatalog.upsertNative(record);
    },
    async findById(sessionId, workspaceRoot = null) {
      return await eventCache.findById(sessionId, workspaceRoot)
        ?? conversationCatalog.findById(sessionId, workspaceRoot);
    },
    async findLatest(workspaceRoot, runtimeId = null) {
      return await eventCache.findLatest(workspaceRoot, runtimeId)
        ?? conversationCatalog.findLatest(workspaceRoot, runtimeId);
    },
    list(workspaceRoot, options = {}) {
      return conversationCatalog.list(workspaceRoot, options);
    },
    async archive(sessionId, archivedAt) {
      await Promise.all([
        eventCache.archive(sessionId, archivedAt),
        conversationCatalog.archive(sessionId, archivedAt),
      ]);
    },
    async remove(sessionId) {
      await Promise.all([eventCache.remove(sessionId), conversationCatalog.remove(sessionId)]);
    },
    readAll: () => eventCache.readAll(),
    clear: () => eventCache.clear?.(),
  };
}
