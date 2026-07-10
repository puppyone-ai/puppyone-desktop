import { randomBytes } from "node:crypto";

export const GIT_DIFF_RESOURCE_BROKER_LIMITS = Object.freeze({
  maxHandlesPerSession: 4,
  maxResourceBytes: 25 * 1024 * 1024,
  maxReadsPerHandle: 2,
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
  limits = GIT_DIFF_RESOURCE_BROKER_LIMITS,
  now = () => Date.now(),
  createToken = () => randomBytes(24).toString("base64url"),
} = {}) {
  const handles = new Map();

  function createSessionId() {
    return `git-diff-session:${createToken()}`;
  }

  function issueDetail(detail, { ownerWebContentsId, sessionId = createSessionId() }) {
    requireAudience(ownerWebContentsId, sessionId);
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
      return { ...detail, files };
    } catch (error) {
      for (const handle of resources) revokeHandle(handle);
      throw error;
    }

    function issueSide(side, sideName, selectionIdentity) {
      if (side.kind !== "resource") return side;
      const bytes = Buffer.from(side.bytes ?? []);
      if (bytes.length !== side.size) {
        throw new GitDiffResourceError("size-mismatch", "Revision resource size does not match its descriptor.");
      }
      if (bytes.length > limits.maxResourceBytes) {
        throw new GitDiffResourceError("resource-too-large", "Revision resource exceeds the broker limit.");
      }
      const sessionHandleCount = [...handles.values()]
        .filter((entry) => entry.sessionId === sessionId && entry.ownerWebContentsId === ownerWebContentsId)
        .length;
      if (sessionHandleCount >= limits.maxHandlesPerSession) {
        throw new GitDiffResourceError("too-many-handles", "Too many revision resources are open for this diff.");
      }

      let handle;
      do {
        handle = `git-diff-resource:${createToken()}`;
      } while (handles.has(handle));
      handles.set(handle, {
        handle,
        ownerWebContentsId,
        sessionId,
        selectionIdentity,
        revisionIdentity: side.identity,
        side: sideName,
        bytes,
        size: bytes.length,
        readsRemaining: limits.maxReadsPerHandle,
        expiresAt: now() + limits.handleTtlMs,
      });
      resources.push(handle);
      const { bytes: _bytes, ...descriptor } = side;
      return { ...descriptor, handle };
    }
  }

  function read({ handle, ownerWebContentsId, sessionId, selectionIdentity, revisionIdentity, signal }) {
    purgeExpired();
    if (signal?.aborted) throw abortError();
    const entry = requireHandle(handle, { ownerWebContentsId, sessionId });
    if (entry.selectionIdentity !== selectionIdentity || entry.revisionIdentity !== revisionIdentity) {
      throw new GitDiffResourceError("identity-mismatch", "Revision resource identity no longer matches the selection.");
    }
    if (entry.readsRemaining <= 0) {
      throw new GitDiffResourceError("read-budget-exhausted", "Revision resource read budget is exhausted.");
    }
    entry.readsRemaining -= 1;
    const copy = Uint8Array.from(entry.bytes);
    if (signal?.aborted) throw abortError();
    return {
      bytes: copy,
      size: entry.size,
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
      revokeHandle(handle);
      revoked += 1;
    }
    if (revoked === 0 && !ignoreMissing) return false;
    return true;
  }

  function revokeOwner(ownerWebContentsId) {
    for (const [handle, entry] of [...handles.entries()]) {
      if (entry.ownerWebContentsId === ownerWebContentsId) revokeHandle(handle);
    }
  }

  function inspect(handle) {
    purgeExpired();
    const entry = handles.get(handle);
    if (!entry) return null;
    const { bytes: _bytes, ...descriptor } = entry;
    return descriptor;
  }

  function dispose() {
    for (const handle of [...handles.keys()]) revokeHandle(handle);
  }

  function requireHandle(handle, audience) {
    const entry = handles.get(handle);
    if (!entry) throw new GitDiffResourceError("revoked", "Revision resource is unknown, expired, or revoked.");
    if (
      entry.ownerWebContentsId !== audience.ownerWebContentsId ||
      entry.sessionId !== audience.sessionId
    ) {
      throw new GitDiffResourceError("audience-mismatch", "Revision resource belongs to another renderer or session.");
    }
    return entry;
  }

  function purgeExpired() {
    const timestamp = now();
    for (const [handle, entry] of [...handles.entries()]) {
      if (entry.expiresAt <= timestamp) revokeHandle(handle);
    }
  }

  function revokeHandle(handle) {
    const entry = handles.get(handle);
    if (!entry) return;
    handles.delete(handle);
    entry.bytes.fill(0);
  }

  return {
    createSessionId,
    issueDetail,
    read,
    revokeSession,
    revokeOwner,
    inspect,
    dispose,
  };
}

function requireAudience(ownerWebContentsId, sessionId) {
  if (!Number.isSafeInteger(ownerWebContentsId)) {
    throw new TypeError("ownerWebContentsId must be a safe integer.");
  }
  if (typeof sessionId !== "string" || sessionId.length < 8 || sessionId.length > 256) {
    throw new TypeError("A bounded diff session id is required.");
  }
}

function abortError() {
  const error = new Error("Revision resource read was aborted.");
  error.name = "AbortError";
  return error;
}
