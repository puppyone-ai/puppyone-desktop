import { randomBytes } from "node:crypto";

const MIB = 1024 * 1024;

export const GIT_DIFF_RESOURCE_BROKER_LIMITS = Object.freeze({
  maxHandlesPerSession: 4,
  maxSessionsPerOwner: 4,
  maxResourceBytes: 25 * MIB,
  maxBytesPerSession: 50 * MIB,
  maxBytesPerOwner: 100 * MIB,
  maxTotalBytes: 256 * MIB,
  maxReadChunkBytes: 4 * MIB,
  maxReadOperationsPerHandle: 32,
  maxReadBytesPerHandle: 50 * MIB,
  handleTtlMs: 2 * 60 * 1000,
});

export class GitDiffResourceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GitDiffResourceError";
    this.code = code;
  }
}

/** Audience-bound, session-scoped immutable revision resource handles. */
export function createGitDiffResourceBroker({
  limits: limitOverrides = {},
  now = () => Date.now(),
  createToken = () => randomBytes(24).toString("base64url"),
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelScheduled = (handle) => clearTimeout(handle),
} = {}) {
  for (const name of Object.keys(limitOverrides)) {
    if (!Object.hasOwn(GIT_DIFF_RESOURCE_BROKER_LIMITS, name)) {
      throw new RangeError(`Unknown Git diff broker limit: ${name}.`);
    }
  }
  const limits = Object.freeze({ ...GIT_DIFF_RESOURCE_BROKER_LIMITS, ...limitOverrides });
  validateLimits(limits);
  const handles = new Map();
  let expiryTimer = null;

  function createSessionId() {
    return `git-diff-session:${createToken()}`;
  }

  function issueDetail(detail, { ownerWebContentsId, sessionId = createSessionId() }) {
    requireAudience(ownerWebContentsId, sessionId);
    purgeExpired();
    revokeSession(sessionId, { ownerWebContentsId, ignoreMissing: true });
    const resources = [];
    try {
      const files = detail.files.map((file) => {
        if (!file.revisionPair) return file;
        const pair = file.revisionPair;
        return {
          ...file,
          revisionPair: {
            ...pair,
            sessionId,
            before: issueSide(pair.before, "before", pair.selectionIdentity),
            after: issueSide(pair.after, "after", pair.selectionIdentity),
          },
        };
      });
      scheduleExpirySweep();
      return { ...detail, files };
    } catch (error) {
      for (const handle of resources) revokeHandle(handle, { reschedule: false });
      scheduleExpirySweep();
      throw error;
    }

    function issueSide(side, sideName, selectionIdentity) {
      if (side.kind !== "resource") return side;
      // Take ownership of the bounded main-process buffer. A second full copy
      // here doubles peak memory and provides no isolation benefit because the
      // source detail is discarded after descriptors are issued.
      const bytes = Buffer.isBuffer(side.bytes) ? side.bytes : Buffer.from(side.bytes ?? []);
      if (bytes.length !== side.size) {
        throw new GitDiffResourceError("size-mismatch", "Revision resource size does not match its descriptor.");
      }
      if (bytes.length > limits.maxResourceBytes) {
        throw new GitDiffResourceError("resource-too-large", "Revision resource exceeds the broker limit.");
      }
      assertAllocationBudget({ ownerWebContentsId, sessionId, bytes: bytes.length });

      const handle = createUniqueHandle();
      handles.set(handle, {
        handle,
        ownerWebContentsId,
        sessionId,
        selectionIdentity,
        revisionIdentity: side.identity,
        side: sideName,
        bytes,
        size: bytes.length,
        readOperationsRemaining: limits.maxReadOperationsPerHandle,
        readBytesRemaining: Math.min(limits.maxReadBytesPerHandle, bytes.length * 2),
        expiresAt: now() + limits.handleTtlMs,
      });
      resources.push(handle);
      const { bytes: _bytes, ...descriptor } = side;
      return { ...descriptor, handle };
    }
  }

  function read({
    handle,
    ownerWebContentsId,
    sessionId,
    selectionIdentity,
    revisionIdentity,
    offset,
    length,
    signal,
  }) {
    purgeExpired();
    if (signal?.aborted) throw abortError();
    const entry = requireHandle(handle, { ownerWebContentsId, sessionId });
    if (entry.selectionIdentity !== selectionIdentity || entry.revisionIdentity !== revisionIdentity) {
      throw new GitDiffResourceError("identity-mismatch", "Revision resource identity no longer matches the selection.");
    }
    const normalizedOffset = requireInteger(offset, "offset", { min: 0, max: entry.size - 1 });
    const normalizedLength = requireInteger(length, "length", { min: 1, max: limits.maxReadChunkBytes });
    const end = Math.min(entry.size, normalizedOffset + normalizedLength);
    const bytesToRead = end - normalizedOffset;
    if (entry.readOperationsRemaining <= 0) {
      throw new GitDiffResourceError("read-budget-exhausted", "Revision resource operation budget is exhausted.");
    }
    if (entry.readBytesRemaining < bytesToRead) {
      throw new GitDiffResourceError("read-budget-exhausted", "Revision resource byte budget is exhausted.");
    }
    entry.readOperationsRemaining -= 1;
    entry.readBytesRemaining -= bytesToRead;
    const copy = Uint8Array.from(entry.bytes.subarray(normalizedOffset, end));
    if (signal?.aborted) throw abortError();
    return {
      bytes: copy,
      offset: normalizedOffset,
      size: entry.size,
      done: end === entry.size,
      revisionIdentity: entry.revisionIdentity,
      selectionIdentity: entry.selectionIdentity,
    };
  }

  function revokeSession(sessionId, { ownerWebContentsId, ignoreMissing = false } = {}) {
    let revoked = 0;
    for (const [handle, entry] of [...handles.entries()]) {
      if (entry.sessionId !== sessionId) continue;
      if (ownerWebContentsId != null && entry.ownerWebContentsId !== ownerWebContentsId) {
        throw new GitDiffResourceError("audience-mismatch", "Diff session belongs to another renderer.");
      }
      revokeHandle(handle, { reschedule: false });
      revoked += 1;
    }
    scheduleExpirySweep();
    if (revoked === 0 && !ignoreMissing) return false;
    return true;
  }

  function revokeOwner(ownerWebContentsId) {
    for (const [handle, entry] of [...handles.entries()]) {
      if (entry.ownerWebContentsId === ownerWebContentsId) {
        revokeHandle(handle, { reschedule: false });
      }
    }
    scheduleExpirySweep();
  }

  function inspect(handle) {
    purgeExpired();
    const entry = handles.get(handle);
    if (!entry) return null;
    const { bytes: _bytes, ...descriptor } = entry;
    return descriptor;
  }

  function getUsage({ ownerWebContentsId = null, sessionId = null } = {}) {
    purgeExpired();
    const entries = [...handles.values()].filter((entry) => (
      (ownerWebContentsId == null || entry.ownerWebContentsId === ownerWebContentsId)
      && (sessionId == null || entry.sessionId === sessionId)
    ));
    return {
      handles: entries.length,
      sessions: new Set(entries.map((entry) => `${entry.ownerWebContentsId}\0${entry.sessionId}`)).size,
      bytes: entries.reduce((total, entry) => total + entry.size, 0),
    };
  }

  function dispose() {
    for (const handle of [...handles.keys()]) revokeHandle(handle, { reschedule: false });
    cancelExpiryTimer();
  }

  function requireHandle(handle, audience) {
    const entry = handles.get(handle);
    if (!entry) throw new GitDiffResourceError("revoked", "Revision resource is unknown, expired, or revoked.");
    if (
      entry.ownerWebContentsId !== audience.ownerWebContentsId
      || entry.sessionId !== audience.sessionId
    ) {
      throw new GitDiffResourceError("audience-mismatch", "Revision resource belongs to another renderer or session.");
    }
    return entry;
  }

  function assertAllocationBudget({ ownerWebContentsId, sessionId, bytes }) {
    const allEntries = [...handles.values()];
    const sessionEntries = allEntries.filter((entry) => (
      entry.ownerWebContentsId === ownerWebContentsId && entry.sessionId === sessionId
    ));
    const ownerEntries = allEntries.filter((entry) => entry.ownerWebContentsId === ownerWebContentsId);
    const ownerSessions = new Set(ownerEntries.map((entry) => entry.sessionId));
    if (sessionEntries.length >= limits.maxHandlesPerSession) {
      throw new GitDiffResourceError("too-many-handles", "Too many revision resources are open for this diff.");
    }
    if (sessionEntries.length === 0 && ownerSessions.size >= limits.maxSessionsPerOwner) {
      throw new GitDiffResourceError("too-many-sessions", "Too many rich diff sessions are open for this window.");
    }
    assertByteBudget(
      sumBytes(sessionEntries) + bytes,
      limits.maxBytesPerSession,
      "session-byte-limit",
      "Rich diff session exceeds its cumulative byte budget.",
    );
    assertByteBudget(
      sumBytes(ownerEntries) + bytes,
      limits.maxBytesPerOwner,
      "owner-byte-limit",
      "Rich diff window exceeds its cumulative byte budget.",
    );
    assertByteBudget(
      sumBytes(allEntries) + bytes,
      limits.maxTotalBytes,
      "global-byte-limit",
      "Rich diff broker exceeds its global byte budget.",
    );
  }

  function purgeExpired() {
    const timestamp = now();
    for (const [handle, entry] of [...handles.entries()]) {
      if (entry.expiresAt <= timestamp) revokeHandle(handle, { reschedule: false });
    }
    scheduleExpirySweep();
  }

  function scheduleExpirySweep() {
    cancelExpiryTimer();
    let nearest = Number.POSITIVE_INFINITY;
    for (const entry of handles.values()) nearest = Math.min(nearest, entry.expiresAt);
    if (!Number.isFinite(nearest)) return;
    expiryTimer = schedule(() => {
      expiryTimer = null;
      purgeExpired();
    }, Math.max(0, nearest - now()));
    expiryTimer?.unref?.();
  }

  function cancelExpiryTimer() {
    if (expiryTimer == null) return;
    cancelScheduled(expiryTimer);
    expiryTimer = null;
  }

  function revokeHandle(handle, { reschedule = true } = {}) {
    const entry = handles.get(handle);
    if (!entry) return;
    handles.delete(handle);
    entry.bytes.fill(0);
    if (reschedule) scheduleExpirySweep();
  }

  function createUniqueHandle() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const handle = `git-diff-resource:${createToken()}`;
      if (!handles.has(handle)) return handle;
    }
    throw new GitDiffResourceError("token-collision", "Unable to allocate a unique revision resource handle.");
  }

  return {
    createSessionId,
    issueDetail,
    read,
    revokeSession,
    revokeOwner,
    inspect,
    getUsage,
    dispose,
  };
}

function requireAudience(ownerWebContentsId, sessionId) {
  if (!Number.isSafeInteger(ownerWebContentsId) || ownerWebContentsId < 1) {
    throw new TypeError("ownerWebContentsId must be a positive safe integer.");
  }
  if (
    typeof sessionId !== "string"
    || !/^[a-zA-Z0-9._:-]{8,256}$/.test(sessionId)
  ) {
    throw new TypeError("A bounded diff session id is required.");
  }
}

function requireInteger(value, label, { min, max }) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new GitDiffResourceError("invalid-range", `Revision resource ${label} is outside the allowed range.`);
  }
  return value;
}

function sumBytes(entries) {
  return entries.reduce((total, entry) => total + entry.size, 0);
}

function assertByteBudget(value, limit, code, message) {
  if (value > limit) throw new GitDiffResourceError(code, message);
}

function validateLimits(limits) {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RangeError(`Git diff broker limit ${name} must be a positive safe integer.`);
    }
  }
}

function abortError() {
  const error = new Error("Revision resource read was aborted.");
  error.name = "AbortError";
  return error;
}
