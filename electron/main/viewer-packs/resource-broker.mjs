import { randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Audience-bound Resource Broker for Viewer Packs.
 * Handles are scoped to plugin instance + owner window + document + revision.
 */

export const VIEWER_PACK_RESOURCE_LIMITS = Object.freeze({
  maxRangeBytes: 8 * 1024 * 1024,
  maxConcurrentRangesPerHandle: 4,
  handleTtlMs: 30 * 60 * 1000,
});

/**
 * Typed error surface for the broker. The `puppyone-resource://` protocol maps
 * these codes to HTTP statuses (403 revoked/expired/audience, 416 not
 * satisfiable, 400 invalid/too-large), so both the protocol and the IPC bridge
 * can react to the same failures without string matching.
 */
export class ResourceBrokerError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "ResourceBrokerError";
    this.code = code;
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

    const handle = `vpr_${createToken()}`;
    handles.set(handle, {
      handle,
      pluginId,
      instanceId,
      ownerWebContentsId,
      documentPath,
      documentRevision: documentRevision ?? null,
      rootPath: path.resolve(rootPath),
      relativePath,
      absolutePath: path.resolve(absolutePath),
      sizeBytes,
      expiresAt: now() + limits.handleTtlMs,
      byteBudgetRemaining: Number.MAX_SAFE_INTEGER,
    });
    return {
      handle,
      sizeBytes,
      supportsRange: true,
    };
  }

  async function openForDocument(request) {
    const authorized = await resolveAuthorizedFilePath(request);
    const stats = await fsp.stat(authorized.absolutePath);
    if (!stats.isFile()) throw new Error("Document path is not a file.");
    return issueHandle({
      ...request,
      absolutePath: authorized.absolutePath,
      rootPath: authorized.rootPath,
      relativePath: authorized.relativePath,
      sizeBytes: stats.size,
    });
  }

  /**
   * Bounded, audience-checked Range read. Accepts BOTH call shapes so the
   * `puppyone-resource://` protocol and the IPC bridge share one code path:
   *   protocol: { handleId, audience: {pluginId,instanceId,ownerWebContentsId}, start, end }
   *   ipc:      { handle, offset, length, pluginId, instanceId, ownerWebContentsId }
   * Always returns { bytes, size, totalSize, start, end, partial }.
   */
  async function readRange(request) {
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

    // Normalize the two range conventions into [start, endInclusive].
    let start;
    let endInclusive;
    if (Number.isSafeInteger(request.offset) || Number.isSafeInteger(request.length)) {
      start = request.offset;
      const length = request.length;
      if (!Number.isSafeInteger(start) || start < 0) {
        throw new ResourceBrokerError("invalid-range", "Range offset must be a non-negative safe integer.");
      }
      if (!Number.isSafeInteger(length) || length <= 0) {
        throw new ResourceBrokerError("invalid-range", "Range length must be a positive safe integer.");
      }
      if (length > limits.maxRangeBytes) {
        throw new ResourceBrokerError("range-too-large", "Range length exceeds host maximum.");
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
      endInclusive = Number.isSafeInteger(rawEnd)
        ? rawEnd
        : start + limits.maxRangeBytes - 1;
      if (endInclusive - start + 1 > limits.maxRangeBytes) {
        endInclusive = start + limits.maxRangeBytes - 1;
      }
    }

    if (start >= entry.sizeBytes) {
      throw new ResourceBrokerError("range-not-satisfiable", "Range is beyond end of resource.");
    }

    const inflight = inFlightByHandle.get(handleId) ?? 0;
    if (inflight >= limits.maxConcurrentRangesPerHandle) {
      throw new ResourceBrokerError("too-many-ranges", "Too many concurrent range requests for this handle.");
    }

    inFlightByHandle.set(handleId, inflight + 1);
    try {
      const clampedEnd = Math.min(entry.sizeBytes - 1, endInclusive);
      const bytes = await readFileSlice(entry.absolutePath, start, clampedEnd);
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

  function getHandle(handle) {
    return handles.get(handle) ?? null;
  }

  function close(handle, audience) {
    const entry = handles.get(handle);
    if (!entry) return false;
    assertAudience(entry, audience);
    handles.delete(handle);
    inFlightByHandle.delete(handle);
    return true;
  }

  function revokeInstance(instanceId) {
    for (const [handle, entry] of Array.from(handles.entries())) {
      if (entry.instanceId === instanceId) {
        handles.delete(handle);
        inFlightByHandle.delete(handle);
      }
    }
  }

  function revokeOwner(ownerWebContentsId) {
    for (const [handle, entry] of Array.from(handles.entries())) {
      if (entry.ownerWebContentsId === ownerWebContentsId) {
        handles.delete(handle);
        inFlightByHandle.delete(handle);
      }
    }
  }

  function revokeAll() {
    handles.clear();
    inFlightByHandle.clear();
  }

  function requireActiveHandle(audience) {
    const entry = handles.get(audience.handle);
    if (!entry) throw new ResourceBrokerError("revoked", "Unknown or revoked resource handle.");
    if (entry.expiresAt <= now()) {
      handles.delete(audience.handle);
      inFlightByHandle.delete(audience.handle);
      throw new ResourceBrokerError("expired", "Resource handle expired.");
    }
    assertAudience(entry, audience);
    return entry;
  }

  function assertAudience(entry, audience) {
    if (
      entry.pluginId !== audience.pluginId ||
      entry.instanceId !== audience.instanceId ||
      entry.ownerWebContentsId !== audience.ownerWebContentsId
    ) {
      throw new ResourceBrokerError("audience-mismatch", "Resource handle audience mismatch.");
    }
  }

  return {
    openForDocument,
    readRange,
    getHandle,
    close,
    revokeInstance,
    revokeOwner,
    revokeAll,
    limits,
  };
}

async function readFileSlice(filePath, start, endInclusive) {
  const length = endInclusive - start + 1;
  const handle = await fsp.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} is required`);
  }
}
