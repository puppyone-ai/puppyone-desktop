import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

/** Audience-bound, revision-pinned Resource Broker for Viewer Packs. */

export const VIEWER_PACK_RESOURCE_LIMITS = Object.freeze({
  maxRangeBytes: 8 * 1024 * 1024,
  maxConcurrentRangesPerHandle: 4,
  maxHandlesPerInstance: 8,
  maxBytesReadPerHandle: 8 * 1024 * 1024 * 1024,
  handleTtlMs: 30 * 60 * 1000,
});

export class ResourceBrokerError extends Error {
  constructor(code, message, details = undefined) {
    super(message ?? code);
    this.name = "ResourceBrokerError";
    this.code = code;
    this.details = details;
  }
}

export function createViewerPackResourceBroker({
  resolveAuthorizedFilePath,
  limits = VIEWER_PACK_RESOURCE_LIMITS,
  createToken = () => randomBytes(24).toString("base64url"),
  now = () => Date.now(),
} = {}) {
  if (typeof resolveAuthorizedFilePath !== "function") {
    throw new TypeError("resolveAuthorizedFilePath is required");
  }

  const handles = new Map();
  const inFlightByHandle = new Map();

  async function openForDocument(request) {
    purgeExpired();
    const instanceHandleCount = [...handles.values()].filter(
      (entry) => entry.instanceId === request.instanceId,
    ).length;
    if (instanceHandleCount >= limits.maxHandlesPerInstance) {
      throw new ResourceBrokerError("too-many-handles", "Too many open resources for this Viewer Pack instance.");
    }

    const authorized = await resolveAuthorizedFilePath(request);
    const absolutePath = path.resolve(authorized.absolutePath);
    const fileHandle = await openRegularFileNoFollow(absolutePath);
    try {
      const stats = await fileHandle.stat();
      if (!stats.isFile()) throw new Error("Document path is not a regular file.");
      const revision = revisionForStats(stats);
      if (request.documentRevision != null && request.documentRevision !== revision) {
        throw new ResourceBrokerError("revision-mismatch", "Document changed before the resource was opened.");
      }
      return issueHandle({
        ...request,
        documentRevision: revision,
        absolutePath,
        rootPath: authorized.rootPath,
        relativePath: authorized.relativePath,
        sizeBytes: stats.size,
        fileHandle,
        identity: identityForStats(stats),
      });
    } catch (error) {
      await fileHandle.close().catch(() => undefined);
      throw error;
    }
  }

  function issueHandle(request) {
    const {
      pluginId,
      instanceId,
      ownerWebContentsId,
      documentPath,
      documentRevision,
      rootPath,
      relativePath,
      sizeBytes,
      absolutePath,
      fileHandle,
      identity,
    } = request;
    requireString(pluginId, "pluginId");
    requireString(instanceId, "instanceId");
    requireString(documentPath, "documentPath");
    requireString(rootPath, "rootPath");
    requireString(relativePath, "relativePath");
    requireString(absolutePath, "absolutePath");
    if (!Number.isSafeInteger(ownerWebContentsId)) {
      throw new TypeError("ownerWebContentsId must be a safe integer");
    }
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      throw new TypeError("sizeBytes must be a non-negative safe integer");
    }

    let handle;
    do {
      handle = `vpr_${createToken()}`;
    } while (handles.has(handle));
    handles.set(handle, {
      handle,
      pluginId,
      instanceId,
      ownerWebContentsId,
      documentPath,
      documentRevision,
      rootPath: path.resolve(rootPath),
      relativePath,
      absolutePath,
      sizeBytes,
      fileHandle,
      identity,
      expiresAt: now() + limits.handleTtlMs,
      byteBudgetRemaining: limits.maxBytesReadPerHandle,
    });
    return { handle, sizeBytes, supportsRange: true, revision: documentRevision };
  }

  async function readRange(request = {}) {
    const handleId = request.handleId ?? request.handle;
    const audience = request.audience ?? {
      pluginId: request.pluginId,
      instanceId: request.instanceId,
      ownerWebContentsId: request.ownerWebContentsId,
    };
    if (typeof handleId !== "string" || !handleId) {
      throw new ResourceBrokerError("invalid-request", "A resource handle is required.");
    }
    const entry = requireActiveHandle({ handle: handleId, ...audience });
    await assertRevision(entry);

    const { start, endInclusive } = normalizeRangeRequest(request, limits.maxRangeBytes);
    if (start >= entry.sizeBytes) {
      throw new ResourceBrokerError(
        "range-not-satisfiable",
        "Range is beyond end of resource.",
        { totalSize: entry.sizeBytes },
      );
    }
    const clampedEnd = Math.min(entry.sizeBytes - 1, endInclusive);
    const requestedLength = clampedEnd - start + 1;
    if (requestedLength > entry.byteBudgetRemaining) {
      throw new ResourceBrokerError("byte-budget-exhausted", "Resource read budget is exhausted.");
    }

    const inflight = inFlightByHandle.get(handleId) ?? 0;
    if (inflight >= limits.maxConcurrentRangesPerHandle) {
      throw new ResourceBrokerError("too-many-ranges", "Too many concurrent range requests for this handle.");
    }
    inFlightByHandle.set(handleId, inflight + 1);
    try {
      const buffer = Buffer.allocUnsafe(requestedLength);
      const { bytesRead } = await entry.fileHandle.read(buffer, 0, requestedLength, start);
      const bytes = bytesRead === requestedLength ? buffer : buffer.subarray(0, bytesRead);
      entry.byteBudgetRemaining -= bytes.length;
      return {
        bytes,
        size: entry.sizeBytes,
        totalSize: entry.sizeBytes,
        start,
        end: start + bytes.length - 1,
        partial: true,
      };
    } finally {
      const current = inFlightByHandle.get(handleId) ?? 1;
      if (current <= 1) inFlightByHandle.delete(handleId);
      else inFlightByHandle.set(handleId, current - 1);
    }
  }

  async function inspect(handle, audience) {
    const entry = requireActiveHandle({ handle, ...audience });
    await assertRevision(entry);
    return publicHandle(entry);
  }

  function getHandle(handle) {
    const entry = handles.get(handle);
    return entry ? publicHandle(entry) : null;
  }

  function close(handle, audience) {
    const entry = handles.get(handle);
    if (!entry) return false;
    assertAudience(entry, audience);
    removeHandle(handle, entry);
    return true;
  }

  function revokeInstance(instanceId) {
    for (const [handle, entry] of [...handles.entries()]) {
      if (entry.instanceId === instanceId) removeHandle(handle, entry);
    }
  }

  function revokeOwner(ownerWebContentsId) {
    for (const [handle, entry] of [...handles.entries()]) {
      if (entry.ownerWebContentsId === ownerWebContentsId) removeHandle(handle, entry);
    }
  }

  function revokeAll() {
    for (const [handle, entry] of [...handles.entries()]) removeHandle(handle, entry);
  }

  function requireActiveHandle(audience) {
    const entry = handles.get(audience.handle);
    if (!entry) throw new ResourceBrokerError("revoked", "Unknown or revoked resource handle.");
    if (entry.expiresAt <= now()) {
      removeHandle(audience.handle, entry);
      throw new ResourceBrokerError("expired", "Resource handle expired.");
    }
    assertAudience(entry, audience);
    return entry;
  }

  async function assertRevision(entry) {
    const stats = await entry.fileHandle.stat().catch(() => null);
    if (!stats || !sameIdentity(entry.identity, identityForStats(stats))) {
      removeHandle(entry.handle, entry);
      throw new ResourceBrokerError("revision-mismatch", "Document changed after the resource handle was issued.");
    }
  }

  function assertAudience(entry, audience = {}) {
    if (
      entry.pluginId !== audience.pluginId ||
      entry.instanceId !== audience.instanceId ||
      entry.ownerWebContentsId !== audience.ownerWebContentsId
    ) {
      throw new ResourceBrokerError("audience-mismatch", "Resource handle audience mismatch.");
    }
  }

  function purgeExpired() {
    for (const [handle, entry] of [...handles.entries()]) {
      if (entry.expiresAt <= now()) removeHandle(handle, entry);
    }
  }

  function removeHandle(handle, entry) {
    handles.delete(handle);
    inFlightByHandle.delete(handle);
    void entry.fileHandle.close().catch(() => undefined);
  }

  return {
    openForDocument,
    readRange,
    inspect,
    getHandle,
    close,
    revokeInstance,
    revokeOwner,
    revokeAll,
    limits,
  };
}

function normalizeRangeRequest(request, maxRangeBytes) {
  let start;
  let endInclusive;
  if (Object.hasOwn(request, "offset") || Object.hasOwn(request, "length")) {
    start = request.offset;
    const length = request.length;
    if (!Number.isSafeInteger(start) || start < 0) {
      throw new ResourceBrokerError("invalid-range", "Range offset must be a non-negative safe integer.");
    }
    if (!Number.isSafeInteger(length) || length <= 0) {
      throw new ResourceBrokerError("invalid-range", "Range length must be a positive safe integer.");
    }
    if (length > maxRangeBytes) {
      throw new ResourceBrokerError("range-too-large", "Range length exceeds host maximum.");
    }
    if (start > Number.MAX_SAFE_INTEGER - length + 1) {
      throw new ResourceBrokerError("invalid-range", "Range arithmetic exceeds safe integer bounds.");
    }
    endInclusive = start + length - 1;
  } else {
    start = request.start;
    const rawEnd = request.end;
    if (!Number.isSafeInteger(start) || start < 0) {
      throw new ResourceBrokerError("invalid-range", "Range start must be a non-negative safe integer.");
    }
    if (rawEnd !== undefined && (!Number.isSafeInteger(rawEnd) || rawEnd < start)) {
      throw new ResourceBrokerError("invalid-range", "Range end must be a safe integer at or after start.");
    }
    endInclusive = rawEnd ?? Math.min(Number.MAX_SAFE_INTEGER, start + maxRangeBytes - 1);
    if (endInclusive - start + 1 > maxRangeBytes) endInclusive = start + maxRangeBytes - 1;
  }
  return { start, endInclusive };
}

async function openRegularFileNoFollow(filePath) {
  const noFollow = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;
  return fsp.open(filePath, fs.constants.O_RDONLY | noFollow);
}

function identityForStats(stats) {
  return {
    dev: String(stats.dev),
    ino: String(stats.ino),
    size: stats.size,
    mtimeMs: Math.floor(stats.mtimeMs),
    ctimeMs: Math.floor(stats.ctimeMs),
  };
}

function sameIdentity(left, right) {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs;
}

function revisionForStats(stats) {
  return `${Math.floor(stats.mtimeMs)}:${stats.size}`;
}

function publicHandle(entry) {
  return {
    handle: entry.handle,
    pluginId: entry.pluginId,
    instanceId: entry.instanceId,
    ownerWebContentsId: entry.ownerWebContentsId,
    documentPath: entry.documentPath,
    documentRevision: entry.documentRevision,
    sizeBytes: entry.sizeBytes,
    expiresAt: entry.expiresAt,
  };
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
}
