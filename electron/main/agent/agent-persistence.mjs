import fs from "node:fs";
import path from "node:path";
import { countTextBytes, redactSecrets } from "./agent-events.mjs";

const MAX_SESSIONS = 20;
const MAX_EVENTS_PER_SESSION = 400;
const MAX_SESSION_BYTES = 512 * 1024;
const MAX_JOURNAL_BYTES = MAX_SESSIONS * MAX_SESSION_BYTES + 128 * 1024;

export function createAgentPersistence({ app, filename = "desktop-agent-sessions.json", fsModule = fs, logger = console }) {
  const filePath = path.join(app.getPath("userData"), filename);
  let writeChain = Promise.resolve();

  async function readAll() {
    try {
      const metadata = await fsModule.promises.stat(filePath);
      if (metadata.size > MAX_JOURNAL_BYTES) {
        logger.warn?.("Desktop Agent session journal exceeded its safety limit; ignoring it.");
        return [];
      }
      const parsed = JSON.parse(await fsModule.promises.readFile(filePath, "utf8"));
      return Array.isArray(parsed?.sessions) ? parsed.sessions : [];
    } catch (error) {
      if (error?.code !== "ENOENT") logger.warn?.("Unable to read Desktop Agent session metadata:", error);
      return [];
    }
  }

  async function findLatest(workspaceRoot) {
    const sessions = await readAll();
    return sessions
      .filter((entry) => entry?.workspaceRoot === workspaceRoot && entry?.provider === "codex" && entry?.providerSessionId)
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0] ?? null;
  }

  function save(record) {
    const safeRecord = normalizeRecord(record);
    writeChain = writeChain.then(async () => {
      const sessions = await readAll();
      const next = [
        safeRecord,
        ...sessions.filter((entry) => entry?.sessionId !== safeRecord.sessionId),
      ]
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
        .slice(0, MAX_SESSIONS);
      await writeFile({ version: 1, sessions: next });
    }).catch((error) => logger.warn?.("Unable to persist Desktop Agent session metadata:", error));
    return writeChain;
  }

  function remove(sessionId) {
    writeChain = writeChain.then(async () => {
      const sessions = await readAll();
      await writeFile({
        version: 1,
        sessions: sessions.filter((entry) => entry?.sessionId !== sessionId),
      });
    }).catch((error) => logger.warn?.("Unable to remove Desktop Agent session metadata:", error));
    return writeChain;
  }

  async function writeFile(value) {
    await fsModule.promises.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    await fsModule.promises.writeFile(temporaryPath, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
    await fsModule.promises.rename(temporaryPath, filePath);
  }

  return { findLatest, save, remove, readAll };
}

function normalizeRecord(record) {
  const safe = redactSecrets({
    sessionId: record.sessionId,
    workspaceRoot: record.workspaceRoot,
    provider: "codex",
    providerSessionId: record.providerSessionId,
    title: record.title || "Codex session",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    terminalState: record.terminalState,
    selectedModel: record.selectedModel || null,
    lastSequence: record.lastSequence,
    // Streaming command output is useful live, but persisting every raw delta
    // increases credential exposure and evicts higher-value conversation
    // events. The completed tool event retains a bounded, redacted preview.
    events: Array.isArray(record.events)
      ? record.events.filter((event) => event?.type !== "command.output.delta").slice(-MAX_EVENTS_PER_SESSION)
      : [],
  });
  while (safe.events.length > 0 && countTextBytes(safe) > MAX_SESSION_BYTES) safe.events.shift();
  return safe;
}

export const agentPersistenceLimits = Object.freeze({
  maxSessions: MAX_SESSIONS,
  maxEventsPerSession: MAX_EVENTS_PER_SESSION,
  maxSessionBytes: MAX_SESSION_BYTES,
  maxJournalBytes: MAX_JOURNAL_BYTES,
});
