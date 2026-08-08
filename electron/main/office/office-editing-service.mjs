import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getMimeType } from "../../../local-api/workspace.mjs";
import { getWorkspaceFileVersion } from "../../../local-api/files/versioned-atomic-write.mjs";
import { createOnlyOfficeBridgeServer } from "./onlyoffice-bridge-server.mjs";
import { signOnlyOfficeJwt, verifyOnlyOfficeJwt } from "./onlyoffice-jwt.mjs";

const SESSION_TTL_MS = 30 * 60 * 1000;
const CLOSED_SESSION_TTL_MS = 2 * 60 * 1000;
const RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 35_000;
const MAX_OFFICE_BYTES = 100 * 1024 * 1024;
const MAX_SESSIONS_PER_OWNER = 4;

export function createOfficeEditingService({
  configuration,
  recoveryRoot,
  readWorkspaceBinaryFileVersion,
  writeWorkspaceBinaryFile,
  absorbWorkspaceEditReviewPath,
  workspaceWatchService = null,
  getOwnerWindow,
  surfaceManager = null,
  fetchImpl = globalThis.fetch,
  logger = console,
}) {
  const sessions = new Map();
  const officeSurfaces = surfaceManager ?? createUnavailableSurfaceManager();
  const bridge = createOnlyOfficeBridgeServer({
    bindHost: configuration.bindHost,
    bindPort: configuration.bindPort,
    publicUrl: configuration.publicUrl,
    resolveSource,
    handleCallback,
  });

  function getAvailability() {
    return Object.freeze({
      available: configuration.configured,
      engine: "onlyoffice",
      reason: configuration.reason,
      documentServerUrl: configuration.documentServerUrl,
    });
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
    requireConfigured();
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
    const bridgeAddress = await bridge.start();
    const sessionId = crypto.randomUUID();
    const capability = crypto.randomBytes(32).toString("base64url");
    const callbackCapability = crypto.randomBytes(32).toString("base64url");
    const extension = path.extname(documentPath).slice(1).toLowerCase();
    const family = resolveDocumentFamily(extension);
    if (!family) throw new Error("This file type is not supported by the Office editing engine.");
    const expiresAt = Date.now() + SESSION_TTL_MS;
    const key = crypto.createHash("sha256")
      .update(`${rootPath}\0${documentPath}\0${file.version}\0${sessionId}`)
      .digest("base64url");
    const sourceUrl = `${bridgeAddress.publicBaseUrl}/office/sessions/${sessionId}/source/${encodeURIComponent(path.basename(documentPath))}?token=${capability}`;
    const callbackUrl = `${bridgeAddress.publicBaseUrl}/office/sessions/${sessionId}/callback?token=${callbackCapability}`;
    const unsignedConfig = {
      document: {
        fileType: extension,
        key,
        title: path.basename(documentPath),
        url: sourceUrl,
        permissions: {
          edit: true,
          download: true,
          print: true,
          review: true,
        },
      },
      documentType: family,
      editorConfig: {
        mode: "edit",
        callbackUrl,
        lang: normalizeLocale(locale),
        customization: {
          autosave: true,
          forcesave: true,
        },
        user: {
          id: `puppyone-${ownerId}`,
          name: "PuppyOne user",
        },
      },
      height: "100%",
      type: "desktop",
      width: "100%",
    };
    const editorConfig = {
      ...unsignedConfig,
      token: signOnlyOfficeJwt(unsignedConfig, configuration.jwtSecret, { ttlSeconds: Math.ceil(SESSION_TTL_MS / 1000) }),
    };
    const session = {
      id: sessionId,
      ownerId,
      rootPath,
      relativePath: documentPath,
      filePath: file.path,
      fileSize: file.size,
      baseVersion: file.version,
      capability,
      callbackCapability,
      key,
      apiScriptUrl: `${configuration.documentServerUrl}/web-apps/apps/api/documents/api.js`,
      editorConfig,
      expiresAt,
      recoveryPath: null,
      surfaceId: null,
      attachmentId: null,
      state: createState(sessionId, documentPath, "ready", file.version),
      cleanupTimer: null,
      saveTail: Promise.resolve(),
    };
    session.cleanupTimer = scheduleCleanup(session, SESSION_TTL_MS);
    sessions.set(sessionId, session);
    publish(session);
    return toRendererSession(session);
  }

  async function forceSave({ ownerId, sessionId }) {
    const session = requireOwnedSession(ownerId, sessionId);
    const command = { c: "forcesave", key: session.key };
    updateState(session, "saving", { message: null });
    try {
      const response = await fetchWithTimeout(
        `${configuration.documentServerUrl}/command?shardkey=${encodeURIComponent(session.key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...command,
            token: signOnlyOfficeJwt(command, configuration.jwtSecret, { ttlSeconds: 120 }),
          }),
        },
      );
      if (!response.ok) throw new Error(`Office save command failed (${response.status}).`);
      const result = await response.json();
      if (Number(result?.error) !== 0) throw new Error(`Office save command was rejected (${result?.error ?? "unknown"}).`);
      return { accepted: true };
    } catch (error) {
      updateState(session, "error", {
        message: error instanceof Error ? error.message : "Office save command failed.",
      });
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
    updateState(session, "awaiting-save", { message: null });
    rescheduleCleanup(session, SESSION_TTL_MS);
    return { closed: true };
  }

  async function resolveConflict({ ownerId, sessionId, resolution }) {
    const session = requireOwnedSession(ownerId, sessionId);
    if (session.state.status !== "conflict" || !session.recoveryPath) {
      throw new Error("This Office session has no unresolved conflict.");
    }
    if (resolution === "reload-external") {
      await fs.rm(session.recoveryPath, { force: true });
      session.recoveryPath = null;
      updateState(session, "closed", { message: null });
      rescheduleCleanup(session, CLOSED_SESSION_TTL_MS);
      return session.state;
    }
    if (resolution !== "keep-edited") throw new Error("Unknown Office conflict resolution.");
    const bytes = await fs.readFile(session.recoveryPath);
    const current = await readWorkspaceBinaryFileVersion(session.rootPath, session.relativePath);
    const result = await writeWorkspaceBinaryFile(session.rootPath, session.relativePath, bytes, {
      expectedVersion: current.version,
    });
    await acknowledgeWrite(session, result.version);
    await fs.rm(session.recoveryPath, { force: true });
    session.recoveryPath = null;
    updateState(session, "saved", { version: result.version, message: null });
    return session.state;
  }

  function closeSessionsForWindow(ownerId) {
    officeSurfaces.destroyOwner(ownerId);
    for (const session of sessions.values()) {
      if (session.ownerId !== ownerId) continue;
      session.ownerId = null;
      rescheduleCleanup(session, SESSION_TTL_MS);
    }
  }

  async function closeAll() {
    officeSurfaces.destroyAll();
    for (const session of sessions.values()) clearTimeout(session.cleanupTimer);
    sessions.clear();
    await bridge.close();
  }

  async function resolveSource({ sessionId, token }) {
    const session = requireSessionCapability(sessionId, token, "capability");
    const metadata = await fs.stat(session.filePath);
    if (!metadata.isFile() || metadata.size > MAX_OFFICE_BYTES) throw new Error("Office source is unavailable.");
    return {
      filePath: session.filePath,
      size: metadata.size,
      name: path.basename(session.relativePath),
      mimeType: getMimeType(session.filePath) ?? "application/octet-stream",
    };
  }

  async function handleCallback({ sessionId, token, authorization, body }) {
    const session = requireSessionCapability(sessionId, token, "callbackCapability");
    verifyCallbackAuthorization(authorization, body);
    if (body?.key !== session.key) throw new Error("Office callback document key is invalid.");
    const status = Number(body?.status);
    if (status === 1) {
      updateState(session, "editing", { message: null });
      return { error: 0 };
    }
    if (status === 4) {
      updateState(session, "closed", { message: null });
      rescheduleCleanup(session, CLOSED_SESSION_TTL_MS);
      return { error: 0 };
    }
    if (status === 3 || status === 7) {
      updateState(session, "error", { message: `ONLYOFFICE reported save error status ${status}.` });
      return { error: 0 };
    }
    if (status !== 2 && status !== 6) return { error: 0 };
    if (typeof body?.url !== "string") throw new Error("Office save callback did not include a download URL.");
    if (String(body?.filetype ?? "").toLowerCase() !== path.extname(session.relativePath).slice(1).toLowerCase()) {
      throw new Error("Office result format does not match the workspace file.");
    }
    return enqueueSessionSave(session, async () => {
      updateState(session, "saving", { message: null });
      try {
        const bytes = await downloadOfficeResult(body.url);
        const resultVersion = getWorkspaceFileVersion(bytes);
        if (resultVersion === session.baseVersion) {
          updateState(session, "saved", { version: resultVersion, message: null });
          if (status === 2) rescheduleCleanup(session, CLOSED_SESSION_TTL_MS);
          return { error: 0 };
        }
        try {
          const result = await writeWorkspaceBinaryFile(session.rootPath, session.relativePath, bytes, {
            expectedVersion: session.baseVersion,
          });
          session.baseVersion = result.version;
          await acknowledgeWrite(session, result.version);
          updateState(session, "saved", { version: result.version, message: null });
          if (status === 2) rescheduleCleanup(session, CLOSED_SESSION_TTL_MS);
          return { error: 0 };
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
          updateState(session, "conflict", {
            message: "The file changed outside PuppyOne. Your Office result is preserved for conflict resolution.",
            recoveryAvailable: true,
          });
          rescheduleCleanup(session, RECOVERY_TTL_MS);
          return { error: 0 };
        }
      } catch (error) {
        updateState(session, "error", {
          message: error instanceof Error ? error.message : "Office result could not be saved.",
        });
        throw error;
      }
    });
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
      logger.warn("Unable to attribute Office workspace write:", error);
    }
    await absorbWorkspaceEditReviewPath(session.rootPath, session.relativePath);
  }

  async function downloadOfficeResult(rawUrl) {
    let url = requireAllowedDownloadUrl(rawUrl);
    for (let redirect = 0; redirect < 4; redirect += 1) {
      const response = await fetchWithTimeout(url, { redirect: "manual" });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Office download redirect has no location.");
        url = requireAllowedDownloadUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new Error(`Office result download failed (${response.status}).`);
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_OFFICE_BYTES) throw new Error("Office result is too large.");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Office result response has no body.");
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_OFFICE_BYTES) {
          await reader.cancel();
          throw new Error("Office result is too large.");
        }
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks, size);
    }
    throw new Error("Office result used too many redirects.");
  }

  function requireAllowedDownloadUrl(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Office result URL is invalid.");
    }
    if (!configuration.downloadOrigins.has(url.origin) || url.username || url.password) {
      throw new Error("Office result URL origin is not allowed.");
    }
    return url.toString();
  }

  async function fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    timer.unref?.();
    try {
      return await fetchImpl(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  function verifyCallbackAuthorization(value, body) {
    if (!value) throw new Error("Office callback authorization is required.");
    const match = /^Bearer\s+(.+)$/i.exec(value);
    if (!match) throw new Error("Invalid Office callback authorization.");
    const verified = verifyOnlyOfficeJwt(match[1], configuration.jwtSecret);
    const signedBody = verified?.payload && typeof verified.payload === "object"
      ? verified.payload
      : verified;
    if (
      signedBody?.key !== body?.key
      || Number(signedBody?.status) !== Number(body?.status)
      || (body?.url !== undefined && signedBody?.url !== body.url)
      || (body?.filetype !== undefined && signedBody?.filetype !== body.filetype)
    ) {
      throw new Error("Office callback token does not match its request body.");
    }
  }

  function requireSessionCapability(sessionId, token, property) {
    const session = sessions.get(sessionId);
    if (!session || typeof token !== "string") throw new Error("Office session is unavailable.");
    const expected = Buffer.from(session[property]);
    const actual = Buffer.from(token);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      throw new Error("Office session capability is invalid.");
    }
    return session;
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
      sessions.delete(session.id);
      if (session.recoveryPath) void fs.rm(session.recoveryPath, { force: true });
      clearTimeout(session.cleanupTimer);
    }, delay);
    timer.unref?.();
    return timer;
  }

  function rescheduleCleanup(session, delay) {
    clearTimeout(session.cleanupTimer);
    session.cleanupTimer = scheduleCleanup(session, delay);
  }

  function requireConfigured() {
    if (!configuration.configured) throw new Error(configuration.reason ?? "Office editing is unavailable.");
  }

  function enqueueSessionSave(session, operation) {
    const result = session.saveTail.catch(() => undefined).then(operation);
    session.saveTail = result.then(() => undefined, () => undefined);
    return result;
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

function requireDocumentPath(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096) throw new Error("Office document path is required.");
  return value;
}

function normalizeLocale(value) {
  return typeof value === "string" && /^[a-z]{2}(?:-[A-Z]{2})?$/.test(value) ? value : "en";
}
