import fs from "node:fs";
import path from "node:path";
import { countTextBytes, isAgentEventEnvelope, redactSecrets } from "./agent-events.mjs";
import {
  migratedRuntimeDescriptor,
  resolvePersistedRuntimeId,
} from "./migrations/legacy-session-format.mjs";

const MAX_SESSIONS = 100;
const MAX_EVENTS_PER_SESSION = 1_000;
const MAX_SESSION_BYTES = 1024 * 1024;
const MAX_JOURNAL_BYTES = 24 * 1024 * 1024;
const JOURNAL_VERSION = 3;

export function createAgentPersistence({ app, filename = "desktop-agent-sessions.json", fsModule = fs, logger = console }) {
  const filePath = path.join(app.getPath("userData"), filename);
  let writeChain = Promise.resolve();
  let cachedSessions = null;
  let loadPromise = null;

  async function readAll() {
    if (cachedSessions) return cachedSessions;
    if (!loadPromise) {
      loadPromise = loadJournal().then((sessions) => {
        cachedSessions = sessions;
        return sessions;
      }).finally(() => { loadPromise = null; });
    }
    return loadPromise;
  }

  async function loadJournal() {
    try {
      const metadata = await fsModule.promises.stat(filePath);
      if (metadata.size > MAX_JOURNAL_BYTES) {
        logger.warn?.("Desktop Agent session journal exceeded its safety limit; ignoring it.");
        return [];
      }
      const parsed = JSON.parse(await fsModule.promises.readFile(filePath, "utf8"));
      if (!Array.isArray(parsed?.sessions)) return [];
      return parsed.sessions
        .map(migrateRecord)
        .filter(Boolean)
        .slice(0, MAX_SESSIONS);
    } catch (error) {
      if (error?.code !== "ENOENT") logger.warn?.("Unable to read Desktop Agent session metadata:", error);
      return [];
    }
  }

  async function findLatest(workspaceRoot, runtimeId = null) {
    const sessions = await readAll();
    return sessions
      .filter((entry) => (
        entry.workspaceRoot === workspaceRoot
        && entry.providerSessionId
        && !entry.archivedAt
        && (!runtimeId || entry.runtimeId === runtimeId)
      ))
      .sort(byUpdatedDescending)[0] ?? null;
  }

  async function findById(sessionId, workspaceRoot = null) {
    const sessions = await readAll();
    return sessions.find((entry) => (
      entry.sessionId === sessionId
      && (!workspaceRoot || entry.workspaceRoot === workspaceRoot)
    )) ?? null;
  }

  async function list(workspaceRoot, { runtimeId = null, includeArchived = false } = {}) {
    const sessions = await readAll();
    return sessions
      .filter((entry) => (
        entry.workspaceRoot === workspaceRoot
        && (!runtimeId || entry.runtimeId === runtimeId)
        && (includeArchived || !entry.archivedAt)
      ))
      .sort(byUpdatedDescending);
  }

  function save(record) {
    const safeRecord = normalizeRecord(record);
    return enqueue(async () => {
      const sessions = await readAll();
      const next = [safeRecord, ...sessions.filter((entry) => entry.sessionId !== safeRecord.sessionId)]
        .sort(byUpdatedDescending)
        .slice(0, MAX_SESSIONS);
      await writeJournal(next);
    }, "persist Desktop Agent session metadata");
  }

  function archive(sessionId, archivedAt = new Date().toISOString()) {
    return enqueue(async () => {
      const sessions = await readAll();
      await writeJournal(sessions.map((entry) => entry.sessionId === sessionId
        ? { ...entry, archivedAt, updatedAt: archivedAt }
        : entry));
    }, "archive Desktop Agent session metadata");
  }

  function remove(sessionId) {
    return enqueue(async () => {
      const sessions = await readAll();
      await writeJournal(sessions.filter((entry) => entry.sessionId !== sessionId));
    }, "remove Desktop Agent session metadata");
  }

  function enqueue(operation, label) {
    writeChain = writeChain.then(operation).catch((error) => {
      logger.warn?.(`Unable to ${label}:`, error);
    });
    return writeChain;
  }

  async function writeJournal(sessions) {
    await fsModule.promises.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    const retainedSessions = fitJournal(sessions);
    const payload = JSON.stringify({ version: JOURNAL_VERSION, sessions: retainedSessions });
    await fsModule.promises.writeFile(temporaryPath, payload, { encoding: "utf8", mode: 0o600 });
    await fsModule.promises.chmod?.(temporaryPath, 0o600);
    await fsModule.promises.rename(temporaryPath, filePath);
    cachedSessions = retainedSessions;
  }

  return { findLatest, findById, list, save, archive, remove, readAll };
}

function fitJournal(sessions) {
  const retained = [];
  let bytes = Buffer.byteLength(JSON.stringify({ version: JOURNAL_VERSION, sessions: [] }), "utf8");
  for (const session of sessions.slice(0, MAX_SESSIONS)) {
    const nextBytes = countTextBytes(session) + (retained.length > 0 ? 1 : 0);
    if (bytes + nextBytes > MAX_JOURNAL_BYTES) break;
    retained.push(session);
    bytes += nextBytes;
  }
  return retained;
}

function normalizeRecord(record) {
  const runtimeId = resolvePersistedRuntimeId(record);
  const sourceEvents = Array.isArray(record.events)
    ? record.events.filter((event) => isAgentEventEnvelope(event) && event.type !== "command.output.delta")
    : [];
  const candidateEvents = sourceEvents.slice(-MAX_EVENTS_PER_SESSION).map((event) => redactSecrets({
    ...event,
    runtimeId,
    provider: runtimeId,
  }));
  let partial = candidateEvents.length < sourceEvents.length || Boolean(record.partial);
  const safe = redactSecrets({
    sessionId: normalizeId(record.sessionId),
    workspaceRoot: normalizePath(record.workspaceRoot),
    runtimeId,
    provider: runtimeId,
    runtime: normalizeRuntime(record.runtime, runtimeId),
    providerSessionId: normalizeOptionalId(record.providerSessionId),
    title: normalizeText(record.title, 200) || "Agent session",
    createdAt: normalizeDate(record.createdAt),
    updatedAt: normalizeDate(record.updatedAt),
    archivedAt: record.archivedAt ? normalizeDate(record.archivedAt) : null,
    terminalState: normalizeText(record.terminalState, 40) || "idle",
    selectedModel: normalizeText(record.selectedModel, 300) || null,
    selectedMode: normalizeText(record.selectedMode, 160) || null,
    lastSequence: normalizeSequence(record.lastSequence),
    partial,
    events: [],
  });
  let retainedBytes = countTextBytes(safe);
  const retained = [];
  for (let index = candidateEvents.length - 1; index >= 0; index -= 1) {
    const event = candidateEvents[index];
    const eventBytes = countTextBytes(event) + 1;
    if (retainedBytes + eventBytes > MAX_SESSION_BYTES) {
      safe.partial = true;
      break;
    }
    retained.unshift(event);
    retainedBytes += eventBytes;
  }
  safe.events = retained;
  return safe;
}

function migrateRecord(record) {
  if (!record || typeof record !== "object") return null;
  try {
    const runtimeId = resolvePersistedRuntimeId(record);
    return normalizeRecord({
      ...record,
      runtimeId,
      runtime: migratedRuntimeDescriptor(record, runtimeId),
    });
  } catch {
    return null;
  }
}

function normalizeRuntime(runtime, fallbackId) {
  // The product-session runtime id is authoritative. Descriptor snapshots may
  // carry a historical alias, but can never change backend ownership.
  const id = normalizeRuntimeId(fallbackId);
  return {
    id,
    displayName: normalizeText(runtime?.displayName, 100) || defaultRuntimeName(id),
    kind: normalizeText(runtime?.kind, 40) || "direct-cli",
    version: normalizeText(runtime?.version, 80) || null,
    source: normalizeText(runtime?.source, 40) || null,
    compatibility: normalizeText(runtime?.compatibility, 80) || null,
  };
}

function normalizeRuntimeId(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{1,39}$/.test(value)) {
    throw new Error("Invalid Agent runtime id.");
  }
  return value;
}

function defaultRuntimeName(id) {
  return String(id).replace(/[-_.]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9:_-]{1,160}$/.test(value)) throw new Error("Invalid Agent session id.");
  return value;
}

function normalizeOptionalId(value) {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{1,240}$/.test(value) ? value : null;
}

function normalizePath(value) {
  if (typeof value !== "string" || !value || value.length > 4_096) throw new Error("Invalid Agent workspace path.");
  return value;
}

function normalizeText(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function normalizeDate(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeSequence(value) {
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0;
}

function byUpdatedDescending(left, right) {
  return String(right.updatedAt).localeCompare(String(left.updatedAt));
}

export const agentPersistenceLimits = Object.freeze({
  maxSessions: MAX_SESSIONS,
  maxEventsPerSession: MAX_EVENTS_PER_SESSION,
  maxSessionBytes: MAX_SESSION_BYTES,
  maxJournalBytes: MAX_JOURNAL_BYTES,
  journalVersion: JOURNAL_VERSION,
});
