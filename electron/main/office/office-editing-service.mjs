import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { normalizeCloudApiBaseUrl } from "../../../shared/cloudEndpoint.js";
import { getWorkspaceFileVersion } from "../../../local-api/files/versioned-atomic-write.mjs";

const RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CLOSED_SESSION_TTL_MS = 2 * 60 * 1000;
const POLL_INTERVAL_MS = 1_000;
const CLOSE_SAVE_TIMEOUT_MS = 25_000;
const MAX_OFFICE_BYTES = 100 * 1024 * 1024;
const MAX_SESSIONS_PER_OWNER = 4;

/**
 * Host-owned adapter for PuppyOne's managed Office API.
 *
 * The Desktop never receives a Document Server secret, starts a callback
 * listener, or exposes a local file URL. The managed backend owns those
 * responsibilities; this adapter owns only local file authority, native
 * surface lifetime, authenticated transport, and atomic persistence.
 */
export function createOfficeEditingService({
  apiBaseUrl,
  cloudAuthService,
  recoveryRoot,
  readWorkspaceBinaryFileVersion,
  writeWorkspaceBinaryFile,
  absorbWorkspaceEditReviewPath,
  workspaceWatchService = null,
  getOwnerWindow,
  surfaceManager = null,
  logger = console,
}) {
  const sessions = new Map();
  const officeSurfaces = surfaceManager ?? createUnavailableSurfaceManager();
  const managedApiBase = normalizeCloudApiBaseUrl(apiBaseUrl);

  async function getAvailability() {
    if (!managedApiBase) {
      return unavailable("PuppyOne Cloud API is not configured.");
    }
    try {
      const result = await cloudAuthService.requestSessionApi(
        managedApiBase,
        "/office/availability",
        { method: "GET" },
      );
      return Object.freeze({
        available: result?.available === true,
        engine: "onlyoffice",
        reason: typeof result?.reason === "string" ? result.reason : null,
      });
    } catch (error) {
      return unavailable(toAvailabilityReason(error));
    }
  }

  async function initialize() {
    await fs.mkdir(recoveryRoot, { recursive: true, mode: 0o700 });
    await fs.chmod(recoveryRoot, 0o700).catch(() => undefined);
    const entries = await fs.readdir(recoveryRoot, { withFileTypes: true });
    const cutoff = Date.now() - RECOVERY_TTL_MS;
    await Promise.all(entries.slice(0, 1000).map(async (entry) => {
      if (!entry.isFile() || !/^[0-9a-f-]{36}-[0-9a-f]{16}\.recovery$/i.test(entry.name)) return;
      const recoveryPath = path.join(recoveryRoot, entry.name);
      const metadata = await fs.stat(recoveryPath).catch(() => null);
      if (metadata && metadata.mtimeMs < cutoff) await fs.rm(recoveryPath, { force: true });
    }));
  }

  async function createSession({ ownerId, rootPath, relativePath, locale = "en" }) {
    requireManagedApi();
    const documentPath = requireDocumentPath(relativePath);
    const sameDocumentSessions = [...sessions.values()].filter((candidate) => (
      candidate.ownerId === ownerId
      && candidate.rootPath === rootPath
      && candidate.relativePath === documentPath
    ));
    const existing = sameDocumentSessions.find((candidate) => (
      ["ready", "editing", "saving", "saved"].includes(candidate.state.status)
    ));
    if (existing) return toRendererSession(existing);
    if (sameDocumentSessions.some((candidate) => candidate.state.status === "awaiting-save")) {
      throw new Error("The previous Office session is still completing its final save.");
    }
    const ownerSessionCount = [...sessions.values()].filter((candidate) => candidate.ownerId === ownerId).length;
    if (ownerSessionCount >= MAX_SESSIONS_PER_OWNER) {
      throw new Error(`Only ${MAX_SESSIONS_PER_OWNER} Office documents may be open in one window.`);
    }

    const file = await readWorkspaceBinaryFileVersion(rootPath, documentPath);
    if (file.size > MAX_OFFICE_BYTES) throw new Error("Office document is too large.");
    const bytes = await fs.readFile(file.path);
    const extension = path.extname(documentPath).slice(1).toLowerCase();
    if (!resolveDocumentFamily(extension)) {
      throw new Error("This file type is not supported by managed Office editing.");
    }
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: getOfficeMimeType(extension) }), path.basename(documentPath));
    form.append("locale", normalizeLocale(locale));
    const managed = await cloudAuthService.requestSessionApi(
      managedApiBase,
      "/office/sessions",
      { method: "POST", body: form },
    );
    const normalized = normalizeManagedSession(managed);
    const session = {
      id: normalized.sessionId,
      ownerId,
      rootPath,
      relativePath: documentPath,
      baseVersion: file.version,
      apiScriptUrl: normalized.apiScriptUrl,
      editorConfig: normalized.editorConfig,
      expiresAt: normalized.expiresAt,
      appliedRevision: 0,
      remoteRevision: normalized.resultRevision,
      recoveryPath: null,
      surfaceId: null,
      attachmentId: null,
      state: createState(normalized.sessionId, documentPath, normalized.status, file.version),
      cleanupTimer: null,
      pollTimer: null,
      pollPromise: null,
      pollFailures: 0,
      closed: false,
    };
    session.cleanupTimer = scheduleCleanup(session, Math.max(1, session.expiresAt - Date.now()));
    sessions.set(session.id, session);
    publish(session);
    schedulePoll(session, 0);
    return toRendererSession(session);
  }

  async function forceSave({ ownerId, sessionId }) {
    const session = requireOwnedSession(ownerId, sessionId);
    if (session.state.status === "conflict") {
      throw new Error(session.state.message ?? "Resolve the Office conflict before saving again.");
    }
    updateState(session, "saving", { message: null });
    try {
      await cloudAuthService.requestSessionApi(
        managedApiBase,
        `/office/sessions/${encodeURIComponent(session.id)}/force-save`,
        { method: "POST" },
      );
      schedulePoll(session, 0);
      return { accepted: true };
    } catch (error) {
      updateState(session, "error", { message: safeMessage(error, "Office save command failed.") });
      throw error;
    }
  }

  async function attachSurface({ ownerId, sessionId, attachmentId, bounds }) {
    const session = requireOwnedSession(ownerId, sessionId);
    const result = await officeSurfaces.attach({
      ownerId,
      sessionId,
      apiScriptUrl: session.apiScriptUrl,
      editorConfig: session.editorConfig,
      attachmentId,
      bounds,
    });
    session.surfaceId = result.surfaceId;
    session.attachmentId = attachmentId;
    return result;
  }

  function setSurfaceBounds({ ownerId, surfaceId, attachmentId, bounds }) {
    return officeSurfaces.setBounds({ ownerId, surfaceId, attachmentId, bounds });
  }

  function detachSurface({ ownerId, surfaceId, attachmentId }) {
    const result = officeSurfaces.detach({ ownerId, surfaceId, attachmentId });
    const session = [...sessions.values()].find((candidate) => candidate.surfaceId === surfaceId);
    if (session) {
      session.surfaceId = null;
      session.attachmentId = null;
    }
    return result;
  }

  async function closeSession({ ownerId, sessionId }) {
    const session = requireOwnedSession(ownerId, sessionId);
    if (session.surfaceId && session.attachmentId) {
      detachSurface({ ownerId, surfaceId: session.surfaceId, attachmentId: session.attachmentId });
    }
    if (session.state.status === "conflict") {
      rescheduleCleanup(session, RECOVERY_TTL_MS);
      return { closed: false, conflict: true };
    }
    if (session.state.status !== "saved") {
      updateState(session, "awaiting-save", { message: null });
      try {
        await forceSave({ ownerId, sessionId });
        await waitForSaveCompletion(session, CLOSE_SAVE_TIMEOUT_MS);
      } catch (error) {
        logger.warn?.("Managed Office final save remains pending:", safeMessage(error));
        rescheduleCleanup(session, RECOVERY_TTL_MS);
        return { closed: false };
      }
    }
    if (session.state.status === "saved") {
      await closeRemoteSession(session).catch((error) => {
        logger.warn?.("Managed Office session cleanup was unavailable:", safeMessage(error));
      });
      retireSession(session, "closed");
    }
    return { closed: session.state.status === "closed" };
  }

  async function resolveConflict({ ownerId, sessionId, resolution }) {
    const session = requireOwnedSession(ownerId, sessionId);
    if (session.state.status !== "conflict" || !session.recoveryPath) {
      throw new Error("This Office session has no unresolved conflict.");
    }
    if (resolution === "reload-external") {
      await fs.rm(session.recoveryPath, { force: true });
      session.recoveryPath = null;
      await closeRemoteSession(session).catch(() => undefined);
      retireSession(session, "closed");
      return session.state;
    }
    if (resolution !== "keep-edited") throw new Error("Unknown Office conflict resolution.");
    const bytes = await fs.readFile(session.recoveryPath);
    const current = await readWorkspaceBinaryFileVersion(session.rootPath, session.relativePath);
    const result = await writeWorkspaceBinaryFile(session.rootPath, session.relativePath, bytes, {
      expectedVersion: current.version,
    });
    session.baseVersion = result.version;
    await acknowledgeWrite(session, result.version);
    await fs.rm(session.recoveryPath, { force: true });
    session.recoveryPath = null;
    updateState(session, "saved", { version: result.version, message: null, recoveryAvailable: false });
    return session.state;
  }

  function closeSessionsForWindow(ownerId) {
    officeSurfaces.destroyOwner(ownerId);
    for (const session of sessions.values()) {
      if (session.ownerId !== ownerId) continue;
      session.ownerId = null;
      clearPoll(session);
      rescheduleCleanup(session, session.recoveryPath ? RECOVERY_TTL_MS : CLOSED_SESSION_TTL_MS);
    }
  }

  async function closeAll() {
    officeSurfaces.destroyAll();
    const active = [...sessions.values()];
    for (const session of active) {
      clearPoll(session);
      clearTimeout(session.cleanupTimer);
    }
    await Promise.allSettled(active
      .filter((session) => session.state.status === "saved")
      .map((session) => closeRemoteSession(session)));
    sessions.clear();
  }

  async function pollSession(session) {
    if (session.closed || sessions.get(session.id) !== session || session.ownerId == null) return;
    if (session.pollPromise) return session.pollPromise;
    session.pollPromise = (async () => {
      try {
        const remote = normalizeManagedState(await cloudAuthService.requestSessionApi(
          managedApiBase,
          `/office/sessions/${encodeURIComponent(session.id)}`,
          { method: "GET" },
        ));
        session.pollFailures = 0;
        session.remoteRevision = Math.max(session.remoteRevision, remote.resultRevision);
        if (remote.resultRevision > session.appliedRevision) {
          await applyRemoteResult(session, remote.resultRevision);
        } else if (remote.status === "error") {
          updateState(session, "error", { message: remote.message ?? "Managed Office reported an error." });
        } else if (remote.status === "saved") {
          updateState(session, "saved", { message: null });
        } else if (remote.status === "saving") {
          updateState(session, "saving", { message: null });
        } else if (remote.status === "editing" && session.state.status !== "saving") {
          updateState(session, "editing", { message: null });
        }
      } catch (error) {
        session.pollFailures += 1;
        if (session.pollFailures >= 3 && session.state.status !== "conflict") {
          updateState(session, "error", { message: safeMessage(error, "Managed Office is temporarily unavailable.") });
        }
      } finally {
        session.pollPromise = null;
        if (!session.closed && sessions.get(session.id) === session && session.ownerId != null) {
          schedulePoll(session, POLL_INTERVAL_MS);
        }
      }
    })();
    return session.pollPromise;
  }

  async function applyRemoteResult(session, revision) {
    const result = await cloudAuthService.requestSessionApi(
      managedApiBase,
      `/office/sessions/${encodeURIComponent(session.id)}/result?revision=${revision}`,
      { method: "GET", responseType: "bytes" },
    );
    const bytes = Buffer.from(result);
    if (bytes.length === 0 || bytes.length > MAX_OFFICE_BYTES) {
      throw new Error("Managed Office returned an invalid result size.");
    }
    const resultVersion = getWorkspaceFileVersion(bytes);
    if (resultVersion === session.baseVersion) {
      session.appliedRevision = revision;
      updateState(session, "saved", { version: resultVersion, message: null });
      return;
    }
    try {
      const write = await writeWorkspaceBinaryFile(session.rootPath, session.relativePath, bytes, {
        expectedVersion: session.baseVersion,
      });
      session.baseVersion = write.version;
      session.appliedRevision = revision;
      await acknowledgeWrite(session, write.version);
      updateState(session, "saved", { version: write.version, message: null });
    } catch (error) {
      if (error?.code !== "WORKSPACE_VERSION_CONFLICT") throw error;
      await fs.mkdir(recoveryRoot, { recursive: true, mode: 0o700 });
      const recoveryPath = path.join(
        recoveryRoot,
        `${session.id}-${crypto.randomBytes(8).toString("hex")}.recovery`,
      );
      await fs.writeFile(recoveryPath, bytes, { mode: 0o600, flag: "wx" });
      if (session.recoveryPath) await fs.rm(session.recoveryPath, { force: true });
      session.recoveryPath = recoveryPath;
      session.appliedRevision = revision;
      updateState(session, "conflict", {
        message: "The file changed outside PuppyOne. Your Office result is preserved for conflict resolution.",
        recoveryAvailable: true,
      });
      rescheduleCleanup(session, RECOVERY_TTL_MS);
    }
  }

  async function acknowledgeWrite(session, version) {
    try {
      workspaceWatchService?.noteInternalWrite?.({
        rootPath: session.rootPath,
        path: session.relativePath,
        senderId: session.ownerId,
        version,
      });
    } catch (error) {
      logger.warn?.("Unable to attribute Office workspace write:", error);
    }
    await absorbWorkspaceEditReviewPath(session.rootPath, session.relativePath);
  }

  async function closeRemoteSession(session) {
    if (session.remoteClosed) return;
    await cloudAuthService.requestSessionApi(
      managedApiBase,
      `/office/sessions/${encodeURIComponent(session.id)}`,
      { method: "DELETE" },
    );
    session.remoteClosed = true;
  }

  async function waitForSaveCompletion(session, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await pollSession(session);
      if (session.state.status === "saved") return;
      if (["conflict", "error"].includes(session.state.status)) {
        throw new Error(session.state.message ?? "Office document could not be saved.");
      }
      await delay(250);
    }
    throw new Error("Timed out while saving the Office document.");
  }

  function schedulePoll(session, delayMs) {
    if (session.closed || sessions.get(session.id) !== session) return;
    clearTimeout(session.pollTimer);
    session.pollTimer = setTimeout(() => void pollSession(session), delayMs);
    session.pollTimer.unref?.();
  }

  function clearPoll(session) {
    clearTimeout(session.pollTimer);
    session.pollTimer = null;
  }

  function requireOwnedSession(ownerId, sessionId) {
    const session = sessions.get(sessionId);
    if (!session || session.ownerId !== ownerId) throw new Error("Office session is unavailable.");
    return session;
  }

  function updateState(session, status, patch = {}) {
    session.state = Object.freeze({ ...session.state, ...patch, status, updatedAt: Date.now() });
    publish(session);
  }

  function publish(session) {
    if (session.ownerId == null) return;
    const window = getOwnerWindow(session.ownerId);
    if (!window || window.isDestroyed?.() || window.webContents?.isDestroyed?.()) return;
    window.webContents.send("office-editing:state", session.state);
  }

  function scheduleCleanup(session, delay) {
    const timer = setTimeout(() => {
      if (sessions.get(session.id) !== session) return;
      retireSession(session, "closed");
      if (session.recoveryPath) void fs.rm(session.recoveryPath, { force: true });
    }, Math.max(1, delay));
    timer.unref?.();
    return timer;
  }

  function rescheduleCleanup(session, delay) {
    clearTimeout(session.cleanupTimer);
    session.cleanupTimer = scheduleCleanup(session, delay);
  }

  function retireSession(session, status) {
    session.closed = true;
    clearPoll(session);
    clearTimeout(session.cleanupTimer);
    updateState(session, status, { message: null });
    sessions.delete(session.id);
  }

  function requireManagedApi() {
    if (!managedApiBase) throw new Error("PuppyOne Cloud API is not configured.");
  }

  return Object.freeze({
    initialize,
    getAvailability,
    createSession,
    attachSurface,
    setSurfaceBounds,
    detachSurface,
    forceSave,
    closeSession,
    resolveConflict,
    closeSessionsForWindow,
    closeAll,
  });
}

function createState(sessionId, pathValue, status, version) {
  return Object.freeze({
    sessionId,
    path: pathValue,
    status,
    version,
    message: null,
    recoveryAvailable: false,
    updatedAt: Date.now(),
  });
}

function toRendererSession(session) {
  return Object.freeze({
    sessionId: session.id,
    state: session.state,
    expiresAt: session.expiresAt,
  });
}

function normalizeManagedSession(value) {
  const sessionId = requireUuid(value?.session_id, "Managed Office session");
  const apiScriptUrl = requireManagedApiScriptUrl(value?.api_script_url);
  if (!value?.editor_config || typeof value.editor_config !== "object" || Array.isArray(value.editor_config)) {
    throw new Error("Managed Office editor configuration is invalid.");
  }
  const expiresAt = Date.parse(value?.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("Managed Office session expiry is invalid.");
  }
  return {
    sessionId,
    apiScriptUrl,
    editorConfig: value.editor_config,
    expiresAt,
    status: normalizeRemoteStatus(value?.status),
    resultRevision: normalizeRevision(value?.result_revision),
  };
}

function normalizeManagedState(value) {
  return {
    sessionId: requireUuid(value?.session_id, "Managed Office session"),
    status: normalizeRemoteStatus(value?.status),
    resultRevision: normalizeRevision(value?.result_revision),
    message: typeof value?.message === "string" && value.message.trim() ? value.message : null,
  };
}

function requireManagedApiScriptUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Managed Office API URL is invalid."); }
  const host = url.hostname.toLowerCase();
  const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const puppyoneHost = host === "puppyone.ai" || host.endsWith(".puppyone.ai");
  if (
    !["http:", "https:"].includes(url.protocol)
    || (!loopback && (url.protocol !== "https:" || !puppyoneHost))
    || url.username
    || url.password
    || url.pathname !== "/web-apps/apps/api/documents/api.js"
  ) {
    throw new Error("Managed Office API URL is not allowed.");
  }
  return url.toString();
}

function normalizeRemoteStatus(value) {
  return ["ready", "editing", "saving", "saved", "awaiting-save", "closed", "error"].includes(value)
    ? value
    : "ready";
}

function normalizeRevision(value) {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Managed Office result revision is invalid.");
  return parsed;
}

function requireUuid(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error(`${label} id is invalid.`);
  return value;
}

function createUnavailableSurfaceManager() {
  const unavailable = async () => { throw new Error("Native Office surfaces are unavailable."); };
  return Object.freeze({
    attach: unavailable,
    setBounds: unavailable,
    detach: unavailable,
    destroyOwner: () => undefined,
    destroyAll: () => undefined,
  });
}

function resolveDocumentFamily(extension) {
  if (extension === "docx") return "word";
  if (extension === "xlsx") return "cell";
  if (extension === "pptx") return "slide";
  return null;
}

function getOfficeMimeType(extension) {
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/octet-stream";
}

function requireDocumentPath(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096) throw new Error("Office document path is required.");
  return value;
}

function normalizeLocale(value) {
  return typeof value === "string" && /^[a-z]{2}(?:-[A-Z]{2})?$/.test(value) ? value : "en";
}

function unavailable(reason) {
  return Object.freeze({ available: false, engine: "onlyoffice", reason });
}

function toAvailabilityReason(error) {
  const message = safeMessage(error, "Managed Office editing is unavailable.");
  if (/sign in|signed-out|401/i.test(message)) return "Sign in to PuppyOne to use managed Office editing.";
  return message;
}

function safeMessage(error, fallback = "Managed Office request failed.") {
  return error instanceof Error && error.message ? error.message : fallback;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
