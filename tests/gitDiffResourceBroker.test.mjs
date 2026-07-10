import { describe, expect, it } from "vitest";
import {
  createGitDiffResourceBroker,
  GitDiffResourceError,
} from "../electron/main/git-diff-resource-broker.mjs";

describe("Git diff revision resource broker", () => {
  it("issues audience-bound handles, validates identities, and revokes sessions", () => {
    let sequence = 0;
    const broker = createGitDiffResourceBroker({ createToken: () => `token-${++sequence}` });
    const detail = broker.issueDetail(resourceDetail(), {
      ownerWebContentsId: 7,
      sessionId: "session:test-1",
    });
    const side = detail.files[0].revisionPair.before;

    expect(side).toMatchObject({ kind: "resource", size: 4 });
    expect(side).not.toHaveProperty("bytes");
    expect(broker.read({
      handle: side.handle,
      ownerWebContentsId: 7,
      sessionId: "session:test-1",
      selectionIdentity: "selection:1",
      revisionIdentity: "git:before",
    }).bytes).toEqual(Uint8Array.from([1, 2, 3, 4]));
    expect(() => broker.read({
      handle: side.handle,
      ownerWebContentsId: 8,
      sessionId: "session:test-1",
      selectionIdentity: "selection:1",
      revisionIdentity: "git:before",
    })).toThrowError(GitDiffResourceError);

    expect(broker.revokeSession("session:test-1", { ownerWebContentsId: 7 })).toBe(true);
    expect(() => broker.read({
      handle: side.handle,
      ownerWebContentsId: 7,
      sessionId: "session:test-1",
      selectionIdentity: "selection:1",
      revisionIdentity: "git:before",
    })).toThrow(/revoked/i);
  });

  it("enforces resource, read, cancellation, and expiry budgets", () => {
    let now = 10;
    const broker = createGitDiffResourceBroker({
      limits: {
        maxHandlesPerSession: 2,
        maxResourceBytes: 4,
        maxReadsPerHandle: 1,
        handleTtlMs: 5,
      },
      now: () => now,
      createToken: () => "stable-token",
    });
    const detail = broker.issueDetail(resourceDetail(), {
      ownerWebContentsId: 3,
      sessionId: "session:test-2",
    });
    const side = detail.files[0].revisionPair.before;
    const request = {
      handle: side.handle,
      ownerWebContentsId: 3,
      sessionId: "session:test-2",
      selectionIdentity: "selection:1",
      revisionIdentity: "git:before",
    };
    broker.read(request);
    expect(() => broker.read(request)).toThrow(/budget/i);

    const aborted = new AbortController();
    aborted.abort();
    expect(() => broker.read({ ...request, signal: aborted.signal })).toThrow(/aborted/i);
    now = 20;
    expect(broker.inspect(side.handle)).toBeNull();

    const oversized = resourceDetail();
    oversized.files[0].revisionPair.before.bytes = Buffer.alloc(5);
    oversized.files[0].revisionPair.before.size = 5;
    expect(() => broker.issueDetail(oversized, {
      ownerWebContentsId: 3,
      sessionId: "session:test-3",
    })).toThrow(/limit/i);
  });
});

function resourceDetail() {
  return {
    commit_id: "working-tree",
    files: [{
      path: "report.docx",
      oldPath: null,
      status: "modified",
      binary: true,
      additions: null,
      deletions: null,
      lines: [],
      revisionPair: {
        repositoryIdentity: "repo:1",
        selectionIdentity: "selection:1",
        scope: "unstaged",
        path: "report.docx",
        oldPath: null,
        status: "modified",
        before: {
          kind: "resource",
          identity: "git:before",
          size: 4,
          mimeType: "application/docx",
          bytes: Buffer.from([1, 2, 3, 4]),
        },
        after: {
          kind: "missing",
          identity: "missing:after",
          size: 0,
          mimeType: null,
          reason: "test",
        },
      },
    }],
  };
}
