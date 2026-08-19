import path from "node:path";
import { createAgentActivityService } from "../application/agent-activity-service.mjs";
import { createHookIngestServer } from "../transport/hook-ingest-server.mjs";
import { createHookSessionAuth } from "../transport/hook-session-auth.mjs";

export function createAgentActivityHost({
  userDataPath,
  getWebContents,
  onAuthenticatedEnvelope,
  logger = console,
}) {
  const subscribers = new Set();
  const auth = createHookSessionAuth();
  const service = createAgentActivityService({
    logger,
    publish(webContentsId, event) {
      if (!subscribers.has(webContentsId)) return;
      const target = getWebContents(webContentsId);
      if (!target || target.isDestroyed?.()) return;
      target.send("agent-activity:event", event);
    },
  });
  const ingestServer = createHookIngestServer({
    auth,
    runtimeDirectory: path.join(userDataPath, "agent-activity", "runtime"),
    logger,
    onEnvelope: onAuthenticatedEnvelope,
  });

  async function prepareTerminalSession(session) {
    const endpoint = await ingestServer.start();
    service.registerTerminalSession(session);
    const token = auth.issue(session);
    return Object.freeze({ endpoint, token });
  }

  function closeTerminalSession(terminalSessionId) {
    auth.revoke(terminalSessionId);
    service.closeTerminalSession(terminalSessionId);
  }

  function subscribe(sender) {
    subscribers.add(sender.id);
    sender.once?.("destroyed", () => subscribers.delete(sender.id));
    return service.getSnapshotForWindow(sender.id);
  }

  function unsubscribe(sender) {
    subscribers.delete(sender.id);
  }

  async function dispose() {
    subscribers.clear();
    auth.clear();
    service.dispose();
    await ingestServer.dispose();
  }

  return Object.freeze({
    prepareTerminalSession,
    closeTerminalSession,
    closeSourceSession: service.closeSourceSession,
    ingest: service.ingest,
    subscribe,
    unsubscribe,
    dispose,
  });
}
