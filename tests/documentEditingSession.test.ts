import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DocumentPersistencePort,
  DocumentPersistenceRequest,
} from "@puppyone/shared-ui";
import { DocumentEditingSession } from "../packages/shared-ui/src/editor/document-session/DocumentEditingSession";
import type { EditorSourceSnapshot } from "../packages/shared-ui/src/editor/sourceSnapshot";

afterEach(() => {
  vi.useRealTimers();
});

describe("DocumentEditingSession", () => {
  it("keeps the editor hot path revision-only and snapshots at the adapter policy boundary", async () => {
    vi.useFakeTimers();
    let snapshotReads = 0;
    let snapshot: EditorSourceSnapshot = { revision: "r1", content: "one" };
    const persist = vi.fn(async () => ({ version: "v2" }));
    const session = createSession(persist, { idleDelayMs: 40, maxDelayMs: 200 });
    session.attachSource({
      readRevision: () => snapshot.revision,
      readSnapshot: () => {
        snapshotReads += 1;
        return snapshot;
      },
    });
    session.reportRevision({ revision: "r1", dirty: false });

    snapshot = { revision: "r2", content: "two" };
    session.reportRevision({ revision: "r2", dirty: true });

    expect(snapshotReads).toBe(0);
    expect(persist).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(39);
    expect(snapshotReads).toBe(0);
    await vi.advanceTimersByTimeAsync(1);

    expect(snapshotReads).toBe(1);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      path: "notes.md",
      content: "two",
      revision: "r2",
      baseVersion: "v1",
      reason: "idle",
    }));
    expect(session.getState().storageVersion).toBe("v2");
  });

  it("serializes writes and coalesces an in-flight edit to the newest revision", async () => {
    const first = deferred<{ version: string }>();
    const second = deferred<{ version: string }>();
    const requests: DocumentPersistenceRequest[] = [];
    const persist = vi.fn((request: DocumentPersistenceRequest) => {
      requests.push(request);
      return requests.length === 1 ? first.promise : second.promise;
    });
    const session = createSession(persist);
    let snapshot: EditorSourceSnapshot = { revision: "r2", content: "two" };
    session.attachSource({
      readRevision: () => snapshot.revision,
      readSnapshot: () => snapshot,
    });
    session.reportRevision({ revision: "r1", dirty: false });
    session.reportRevision({ revision: "r2", dirty: true });
    const firstFlush = session.requestSave("manual");

    snapshot = { revision: "r3", content: "three" };
    session.reportRevision({ revision: "r3", dirty: true });
    const finalFlush = session.flushSnapshot(snapshot, "document-switch");

    expect(persist).toHaveBeenCalledTimes(1);
    first.resolve({ version: "v2" });
    await firstFlush;
    await nextMicrotask();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(requests[1]).toMatchObject({
      content: "three",
      revision: "r3",
      baseVersion: "v2",
      reason: "document-switch",
    });
    second.resolve({ version: "v3" });
    await finalFlush;

    expect(session.getPersistedContent()).toBe("three");
    expect(session.getState()).toMatchObject({
      persistedRevision: "r3",
      storageVersion: "v3",
    });
  });

  it("never bypasses an in-flight write when destruction supplies a newer snapshot", async () => {
    const first = deferred<{ version: string }>();
    const requests: DocumentPersistenceRequest[] = [];
    const persist = vi.fn((request: DocumentPersistenceRequest) => {
      requests.push(request);
      return requests.length === 1 ? first.promise : Promise.resolve({ version: "v3" });
    });
    const session = createSession(persist);
    session.reportRevision({ revision: "r2", dirty: true });
    const firstFlush = session.flushSnapshot({ revision: "r2", content: "two" }, "document-switch");
    session.reportRevision({ revision: "r3", dirty: true });
    const destroyFlush = session.flushSnapshot({ revision: "r3", content: "three" }, "destroy");

    expect(persist).toHaveBeenCalledTimes(1);
    first.resolve({ version: "v2" });
    await firstFlush;
    await destroyFlush;

    expect(requests.map(({ revision }) => revision)).toEqual(["r2", "r3"]);
    expect(requests[1].baseVersion).toBe("v2");
    expect(session.getPersistedContent()).toBe("three");
  });

  it("reads and drains the exact current snapshot before app close", async () => {
    const persist = vi.fn(async () => ({ version: "v2" }));
    const session = createSession(persist);
    const readSnapshot = vi.fn(() => ({ revision: "r2", content: "closing text" }));
    session.attachSource({ readRevision: () => "r2", readSnapshot });
    session.reportRevision({ revision: "r2", dirty: true });

    await session.flushCurrent();

    expect(readSnapshot).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      content: "closing text",
      revision: "r2",
      reason: "app-close",
    }));
    expect(session.hasUnpersistedChanges()).toBe(false);
  });

  it("drains a newer revision that arrives during the first app-close write", async () => {
    const first = deferred<{ version: string }>();
    const second = deferred<{ version: string }>();
    const requests: DocumentPersistenceRequest[] = [];
    const persist = vi.fn((request: DocumentPersistenceRequest) => {
      requests.push(request);
      return requests.length === 1 ? first.promise : second.promise;
    });
    const session = createSession(persist);
    let snapshot = { revision: "r2", content: "first close snapshot" };
    session.attachSource({ readRevision: () => snapshot.revision, readSnapshot: () => snapshot });
    session.reportRevision({ revision: "r2", dirty: true });

    let closeSettled = false;
    const closePromise = session.flushCurrent().then(() => {
      closeSettled = true;
    });
    snapshot = { revision: "r3", content: "last close snapshot" };
    session.reportRevision({ revision: "r3", dirty: true });
    first.resolve({ version: "v2" });
    await nextMicrotask();

    expect(closeSettled).toBe(false);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      revision: "r3",
      content: "last close snapshot",
      baseVersion: "v2",
      reason: "app-close",
    });

    second.resolve({ version: "v3" });
    await closePromise;
    expect(closeSettled).toBe(true);
    expect(session.hasUnpersistedChanges()).toBe(false);
  });

  it("waits for a detached source's queued commit during app close", async () => {
    const write = deferred<{ version: string }>();
    const persist = vi.fn(() => write.promise);
    const session = createSession(persist);
    session.reportRevision({ revision: "r2", dirty: true });
    const writePromise = session.flushSnapshot(
      { revision: "r2", content: "closing text" },
      "destroy",
    );

    let closeSettled = false;
    const closePromise = session.flushCurrent().then(() => {
      closeSettled = true;
    });
    await nextMicrotask();
    expect(closeSettled).toBe(false);

    write.resolve({ version: "v2" });
    await Promise.all([writePromise, closePromise]);
    expect(closeSettled).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("restores the saved baseline when an undo races an older in-flight write", async () => {
    const first = deferred<{ version: string }>();
    const requests: DocumentPersistenceRequest[] = [];
    const persist = vi.fn((request: DocumentPersistenceRequest) => {
      requests.push(request);
      return requests.length === 1 ? first.promise : Promise.resolve({ version: "v3" });
    });
    const session = createSession(persist);

    session.reportRevision({ revision: "r2", dirty: true });
    const firstFlush = session.flushSnapshot({ revision: "r2", content: "two" }, "document-switch");

    session.reportRevision({ revision: "r3", dirty: false });
    const undoFlush = session.flushSnapshot({ revision: "r3", content: "one" }, "destroy");

    expect(persist).toHaveBeenCalledTimes(1);
    first.resolve({ version: "v2" });
    await firstFlush;
    await undoFlush;

    expect(requests.map(({ content }) => content)).toEqual(["two", "one"]);
    expect(requests[1]).toMatchObject({
      revision: "r3",
      baseVersion: "v2",
      reason: "destroy",
    });
    expect(session.getPersistedContent()).toBe("one");
    expect(session.hasUnpersistedChanges()).toBe(false);
  });

  it("does not write twice when a newer revision returns to the in-flight content", async () => {
    const first = deferred<{ version: string }>();
    const persist = vi.fn(() => first.promise);
    const session = createSession(persist);

    session.reportRevision({ revision: "r2", dirty: true });
    const firstFlush = session.flushSnapshot({ revision: "r2", content: "two" }, "document-switch");
    session.reportRevision({ revision: "r3", dirty: true });
    const finalFlush = session.flushSnapshot({ revision: "r3", content: "two" }, "destroy");

    first.resolve({ version: "v2" });
    await firstFlush;
    await finalFlush;

    expect(persist).toHaveBeenCalledTimes(1);
    expect(session.getState()).toMatchObject({
      status: "clean",
      currentRevision: "r3",
      persistedRevision: "r3",
      storageVersion: "v2",
    });
  });

  it("does not overwrite a pending edit with an external baseline", () => {
    const session = createSession(vi.fn(async () => ({ version: "v2" })));
    session.reportRevision({ revision: "r2", dirty: true });

    expect(session.reconcileExternalBaseline("external", "external-version")).toBe("conflict");
    expect(session.getPersistedContent()).toBe("one");
    expect(session.getState()).toMatchObject({
      status: "error",
      storageVersion: "v1",
    });
  });

  it("surfaces a failed conditional write without losing the dirty revision", async () => {
    const persist = vi.fn(async () => {
      throw new Error("File changed outside PuppyOne");
    });
    const session = createSession(persist);
    session.reportRevision({ revision: "r2", dirty: true });

    await expect(
      session.flushSnapshot({ revision: "r2", content: "two" }, "document-switch"),
    ).rejects.toThrow("outside PuppyOne");
    expect(session.hasUnpersistedChanges()).toBe(true);
    expect(session.getState()).toMatchObject({
      status: "error",
      error: "File changed outside PuppyOne",
    });
  });

  it("settles the caller when an adapter throws before returning its Promise", async () => {
    const session = createSession(() => {
      throw new Error("Desktop bridge unavailable");
    });
    session.reportRevision({ revision: "r2", dirty: true });

    await expect(
      session.flushSnapshot({ revision: "r2", content: "two" }, "document-switch"),
    ).rejects.toThrow("Desktop bridge unavailable");
    expect(session.getState()).toMatchObject({
      status: "error",
      error: "Desktop bridge unavailable",
    });
  });
});

function createSession(
  persist: DocumentPersistencePort["persist"],
  policy = { idleDelayMs: 400, maxDelayMs: 2000 },
) {
  return new DocumentEditingSession({
    documentId: "notes.md",
    initialContent: "one",
    initialVersion: "v1",
    saveMode: "auto",
    persistence: {
      kind: "local-fs",
      policy,
      persist,
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function nextMicrotask() {
  await Promise.resolve();
  await Promise.resolve();
}
