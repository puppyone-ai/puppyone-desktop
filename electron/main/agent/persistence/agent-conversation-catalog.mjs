import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const CATALOG_VERSION = 1;
const MAX_RECORDS = 500;

/**
 * Durable metadata-only index of native Agent sessions.
 * Transcripts, tool payloads, prompts and credentials intentionally have no
 * serialization path here; the selected native harness remains authoritative.
 */
export function createAgentConversationCatalog({ filePath, logger = console } = {}) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    throw new TypeError("Agent conversation catalog requires an absolute file path.");
  }
  let loaded = false;
  let records = [];
  let writeChain = Promise.resolve();

  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      const parsed = JSON.parse(await fs.promises.readFile(filePath, "utf8"));
      if (parsed?.version !== CATALOG_VERSION || !Array.isArray(parsed.records)) return;
      records = parsed.records.map(normalizeRecord).filter(Boolean).slice(0, MAX_RECORDS);
    } catch (error) {
      if (error?.code !== "ENOENT") logger.warn?.("Agent conversation catalog could not be read; starting with an empty index.");
    }
  }

  async function persist() {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    const payload = `${JSON.stringify({ version: CATALOG_VERSION, records }, null, 2)}\n`;
    await fs.promises.writeFile(temporaryPath, payload, { encoding: "utf8", mode: 0o600 });
    await fs.promises.rename(temporaryPath, filePath);
  }

  function schedulePersist() {
    writeChain = writeChain.then(persist, persist);
    return writeChain;
  }

  async function saveRecord(record) {
    await load();
    const normalized = normalizeRecord(record);
    if (!normalized) throw new TypeError("Agent conversation metadata is invalid.");
    const index = records.findIndex((entry) => entry.sessionId === normalized.sessionId);
    if (index >= 0) records.splice(index, 1);
    records.unshift(normalized);
    records = records
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_RECORDS);
    await schedulePersist();
    return clone(normalized);
  }

  return {
    save(record) {
      return saveRecord({ ...record, origin: record?.origin ?? "puppyone" });
    },

    async upsertNative(record) {
      await load();
      const workspaceRoot = absolutePath(record?.workspaceRoot);
      const runtimeId = safeId(record?.runtimeId ?? record?.runtime?.id);
      const providerSessionId = safeId(record?.providerSessionId);
      const existing = records.find((entry) => (
        entry.workspaceRoot === workspaceRoot
        && entry.runtimeId === runtimeId
        && entry.providerSessionId === providerSessionId
      ));
      return saveRecord({
        ...record,
        sessionId: existing?.sessionId ?? randomUUID(),
        origin: "native-discovery",
      });
    },

    async findById(sessionId, workspaceRoot = null) {
      await load();
      const id = safeId(sessionId);
      const root = workspaceRoot == null ? null : absolutePath(workspaceRoot);
      return clone(records.find((entry) => entry.sessionId === id && (!root || entry.workspaceRoot === root)) ?? null);
    },

    async findLatest(workspaceRoot, runtimeId = null) {
      await load();
      const root = absolutePath(workspaceRoot);
      const runtime = runtimeId == null ? null : safeId(runtimeId);
      return clone(records.find((entry) => (
        !entry.archivedAt
        && entry.workspaceRoot === root
        && (!runtime || entry.runtimeId === runtime)
      )) ?? null);
    },

    async list(workspaceRoot = null, { runtimeId = null, includeArchived = false } = {}) {
      await load();
      const root = workspaceRoot == null ? null : absolutePath(workspaceRoot);
      const runtime = runtimeId == null ? null : safeId(runtimeId);
      return records.filter((entry) => (
        (!root || entry.workspaceRoot === root)
        && (!runtime || entry.runtimeId === runtime)
        && (includeArchived || !entry.archivedAt)
      )).map(clone);
    },

    async archive(sessionId, archivedAt = new Date().toISOString()) {
      await load();
      const index = records.findIndex((entry) => entry.sessionId === safeId(sessionId));
      if (index < 0) return false;
      records[index] = { ...records[index], archivedAt: isoDate(archivedAt) ?? new Date().toISOString() };
      await schedulePersist();
      return true;
    },

    async remove(sessionId) {
      await load();
      const next = records.filter((entry) => entry.sessionId !== safeId(sessionId));
      if (next.length === records.length) return false;
      records = next;
      await schedulePersist();
      return true;
    },
  };
}

function normalizeRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sessionId = safeId(value.sessionId);
  const workspaceRoot = absolutePath(value.workspaceRoot);
  const runtimeId = safeId(value.runtimeId ?? value.runtime?.id);
  const providerSessionId = safeId(value.providerSessionId);
  const createdAt = isoDate(value.createdAt);
  const updatedAt = isoDate(value.updatedAt);
  if (!sessionId || !workspaceRoot || !runtimeId || !providerSessionId || !createdAt || !updatedAt) return null;
  return compact({
    sessionId,
    workspaceRoot,
    runtimeId,
    runtime: normalizeRuntime(value.runtime, runtimeId),
    providerSessionId,
    title: bounded(value.title, 500) || "Agent session",
    createdAt,
    updatedAt,
    archivedAt: isoDate(value.archivedAt),
    terminalState: terminalState(value.terminalState),
    lastSequence: Number.isSafeInteger(value.lastSequence) && value.lastSequence >= 0 ? value.lastSequence : 0,
    partial: true,
    selectedProviderId: safeId(value.selectedProviderId) ?? providerIdFromModel(value.selectedModel ?? value.model),
    selectedModel: bounded(value.selectedModel ?? value.model, 512),
    selectedVariant: bounded(value.selectedVariant ?? value.variant, 160),
    selectedEffort: bounded(value.selectedEffort ?? value.effort, 160),
    selectedMode: bounded(value.selectedMode ?? value.mode, 160),
    capabilityRevision: bounded(value.capabilityRevision, 160),
    origin: value.origin === "native-discovery" ? "native-discovery" : "puppyone",
  });
}

function normalizeRuntime(value, runtimeId) {
  const runtime = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return compact({
    id: runtimeId,
    displayName: bounded(runtime.displayName, 160) || runtimeId,
    kind: bounded(runtime.kind, 80),
    version: bounded(runtime.version, 80),
    source: bounded(runtime.source, 80),
    compatibility: bounded(runtime.compatibility, 120),
  });
}

function safeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9:._-]{1,256}$/.test(value) ? value : null;
}

function terminalState(value) {
  return ["idle", "running", "completed", "failed", "interrupted", "provider-exited"].includes(value)
    ? value
    : "idle";
}

function providerIdFromModel(value) {
  if (typeof value !== "string") return null;
  const separator = value.indexOf("/");
  return separator > 0 ? safeId(value.slice(0, separator)) : null;
}

function absolutePath(value) {
  return typeof value === "string" && path.isAbsolute(value) ? path.resolve(value) : null;
}

function bounded(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) || null : null;
}

function isoDate(value) {
  if (typeof value !== "string" || value.length > 64) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry != null));
}

function clone(value) {
  return value ? { ...value } : null;
}
