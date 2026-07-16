import { describe, expect, it, vi } from "vitest";
import type {
  DocumentPersistencePort,
  DocumentPersistenceRequest,
} from "@puppyone/shared-ui";
import { DocumentEditingSession } from "../packages/shared-ui/src/editor/document-session/DocumentEditingSession";
import type { EditorSourceSnapshot } from "../packages/shared-ui/src/editor/sourceSnapshot";

describe("DocumentEditingSession", () => {
  it("starts persistence in the next microtask without waiting for a timer", async () => {
    const persist = vi.fn(async () => ({ version: "v2" }));
    const session = createSession(persist);
    const source = bindSource(session, { revision: "r1", content: "one" });

    source.change({ revision: "r2", content: "two" });

    expect(persist).not.toHaveBeenCalled();
    await nextMicrotask();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      path: "notes.md",
      content: "two",
      revision: "r2",
      baseVersion: "v1",
      reason: "edit",
    }));
    expect(session.getState().storageVersion).toBe("v2");
  });

  it("coalesces edits from one JavaScript turn to the newest snapshot", async () => {
    const persist = vi.fn(async () => ({ version: "v2" }));
    const session = createSession(persist);
    const source = bindSource(session, { revision: "r1", content: "one" });

    source.change({ revision: "r2", content: "two" });
    source.change({ revision: "r3", content: "three" });
    await nextMicrotask();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      revision: "r3",
      content: "three",
    }));
  });

  it("keeps one write in flight and persists only the newest following edit", async () => {
    const first = deferred<{ version: string }>();
    const second = deferred<{ version: string }>();
    const requests: DocumentPersistenceRequest[] = [];
    const persist = vi.fn((request: DocumentPersistenceRequest) => {
      requests.push(request);
      return requests.length === 1 ? first.promise : second.promise;
    });
    const session = createSession(persist);
    const source = bindSource(session, { revision: "r1", content: "one" });

    source.change({ revision: "r2", content: "two" });
    await nextMicrotask();
    source.change({ revision: "r3", content: "three" });
    source.change({ revision: "r4", content: "four" });
    await nextMicrotask();

    expect(requests.map(({ revision }) => revision)).toEqual(["r2"]);
    first.resolve({ version: "v2" });
    await nextMicrotask();
    expect(requests.map(({ revision }) => revision)).toEqual(["r2", "r4"]);
    expect(requests[1]).toMatchObject({ content: "four", baseVersion: "v2" });

    second.resolve({ version: "v3" });
    await session.flushCurrent("document-close");
    expect(session.hasUnpersistedChanges()).toBe(false);
    expect(session.getState()).toMatchObject({
      currentRevision: "r4",
      persistedRevision: "r4",
      storageVersion: "v3",
    });
  });

  it("does not treat the filesystem echo of an in-flight save as an external conflict", async () => {
    const first = deferred<{ version: string }>();
    const second = deferred<{ version: string }>();
    const requests: DocumentPersistenceRequest[] = [];
    const persist = vi.fn((request: DocumentPersistenceRequest) => {
      requests.push(request);
      return requests.length === 1 ? first.promise : second.promise;
    });
    const session = createSession(persist);
    const source = bindSource(session, { revision: "r1", content: "one" });

    source.change({ revision: "r2", content: "two" });
    await nextMicrotask();
    source.change({ revision: "r3", content: "three" });
    await nextMicrotask();

    expect(session.reconcileExternalBaseline("two", "v2")).toBe("acknowledged");
    expect(session.getState()).toMatchObject({ status: "saving", error: null });

    first.resolve({ version: "v2" });
    await nextMicrotask();
    expect(requests[1]).toMatchObject({ content: "three", baseVersion: "v2" });

    second.resolve({ version: "v3" });
    await session.flushCurrent("document-close");
    expect(session.hasUnpersistedChanges()).toBe(false);
    expect(session.getState()).toMatchObject({
      status: "saved",
      error: null,
      storageVersion: "v3",
    });
  });

  it("promotes a pending edit to the navigation drain reason", async () => {
    const first = deferred<{ version: string }>();
    const second = deferred<{ version: string }>();
    const requests: DocumentPersistenceRequest[] = [];
    const persist = vi.fn((request: DocumentPersistenceRequest) => {
      requests.push(request);
      return requests.length === 1 ? first.promise : second.promise;
    });
    const session = createSession(persist);
    const source = bindSource(session, { revision: "r1", content: "one" });

    source.change({ revision: "r2", content: "two" });
    await nextMicrotask();
    source.change({ revision: "r3", content: "three" });
    const drain = session.flushCurrent("document-switch");

    first.resolve({ version: "v2" });
    await nextMicrotask();
    expect(requests[1]).toMatchObject({
      revision: "r3",
      content: "three",
      baseVersion: "v2",
      reason: "document-switch",
    });
    second.resolve({ version: "v3" });
    await drain;
  });

  it("captures the exact final snapshot before an editor model is destroyed", async () => {
    const persist = vi.fn(async () => ({ version: "v2" }));
    const session = createSession(persist);
    const source = bindSource(session, { revision: "r1", content: "one" });
    source.change({ revision: "r2", content: "closing text" });

    source.detach();
    session.dispose();
    await session.flushCurrent("destroy");

    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      revision: "r2",
      content: "closing text",
      reason: "destroy",
    }));
    expect(session.hasUnpersistedChanges()).toBe(false);
  });

  it("drains a newer revision that arrives during an app-close write", async () => {
    const first = deferred<{ version: string }>();
    const second = deferred<{ version: string }>();
    const requests: DocumentPersistenceRequest[] = [];
    const persist = vi.fn((request: DocumentPersistenceRequest) => {
      requests.push(request);
      return requests.length === 1 ? first.promise : second.promise;
    });
    const session = createSession(persist);
    const source = bindSource(session, { revision: "r1", content: "one" });
    source.change({ revision: "r2", content: "first close snapshot" });

    const closePromise = session.flushCurrent("app-close");
    source.change({ revision: "r3", content: "last close snapshot" });
    first.resolve({ version: "v2" });
    await nextMicrotask();

    expect(requests[1]).toMatchObject({
      revision: "r3",
      content: "last close snapshot",
      baseVersion: "v2",
      reason: "app-close",
    });
    second.resolve({ version: "v3" });
    await closePromise;
    expect(session.hasUnpersistedChanges()).toBe(false);
  });

  it("writes an undo after the older edited value has crossed storage", async () => {
    const first = deferred<{ version: string }>();
    const requests: DocumentPersistenceRequest[] = [];
    const persist = vi.fn((request: DocumentPersistenceRequest) => {
      requests.push(request);
      return requests.length === 1 ? first.promise : Promise.resolve({ version: "v3" });
    });
    const session = createSession(persist);
    const source = bindSource(session, { revision: "r1", content: "one" });
    source.change({ revision: "r2", content: "two" });
    await nextMicrotask();

    source.change({ revision: "r3", content: "one" }, false);
    const drain = session.flushCurrent("document-switch");
    first.resolve({ version: "v2" });
    await drain;

    expect(requests.map(({ content }) => content)).toEqual(["two", "one"]);
    expect(requests[1]).toMatchObject({ baseVersion: "v2", reason: "document-switch" });
    expect(session.hasUnpersistedChanges()).toBe(false);
  });

  it("does not write twice when a newer revision has the in-flight content", async () => {
    const first = deferred<{ version: string }>();
    const persist = vi.fn(() => first.promise);
    const session = createSession(persist);
    const source = bindSource(session, { revision: "r1", content: "one" });
    source.change({ revision: "r2", content: "two" });
    await nextMicrotask();

    source.change({ revision: "r3", content: "two" });
    const drain = session.flushCurrent("document-switch");
    first.resolve({ version: "v2" });
    await drain;

    expect(persist).toHaveBeenCalledTimes(1);
    expect(session.getState()).toMatchObject({
      status: "clean",
      currentRevision: "r3",
      persistedRevision: "r3",
    });
  });

  it("applies an external baseline only while clean", async () => {
    const persist = vi.fn(async () => ({ version: "v2" }));
    const session = createSession(persist, "manual");
    const source = bindSource(session, { revision: "r1", content: "one" });

    expect(session.reconcileExternalBaseline("external", "external-v1")).toBe("applied");
    expect(session.getState()).toMatchObject({ status: "clean", storageVersion: "external-v1" });

    source.change({ revision: "r2", content: "local" });
    expect(session.reconcileExternalBaseline("agent edit", "external-v2")).toBe("conflict");
    expect(session.getState()).toMatchObject({
      status: "error",
      error: { code: "external-conflict" },
      storageVersion: "external-v1",
    });
    await expect(session.requestSave()).rejects.toThrow("changed outside the editor");
    expect(persist).not.toHaveBeenCalled();

    await session.resolveExternalConflict("reload-external");
    expect(source.snapshot()).toMatchObject({ content: "agent edit" });
    expect(session.getState()).toMatchObject({
      status: "clean",
      storageVersion: "external-v2",
    });
  });

  it("does not let a remounted editor mark detached unsaved content clean", async () => {
    const persist = vi.fn(async () => ({ version: "v2" }));
    const session = createSession(persist, "manual");
    const firstSource = bindSource(session, { revision: "r1", content: "one" });
    firstSource.change({ revision: "r2", content: "two" });
    firstSource.detach();

    const secondSource = bindSource(session, { revision: "r3", content: "two" });
    expect(session.hasUnpersistedChanges()).toBe(true);
    expect(session.getState().status).toBe("dirty");

    await session.requestSave();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      revision: "r3",
      content: "two",
      reason: "manual",
    }));
    secondSource.detach();
  });

  it("cancels a queued follow-up write when an external conflict arrives", async () => {
    const first = deferred<{ version: string }>();
    const persist = vi.fn(() => first.promise);
    const session = createSession(persist);
    const source = bindSource(session, { revision: "r1", content: "one" });
    source.change({ revision: "r2", content: "two" });
    await nextMicrotask();
    source.change({ revision: "r3", content: "three" });
    await nextMicrotask();

    expect(session.reconcileExternalBaseline("agent update", "agent-v2")).toBe("conflict");
    first.resolve({ version: "v2" });
    await nextMicrotask();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(session.getState()).toMatchObject({
      status: "error",
      error: { code: "external-conflict" },
    });
    await expect(session.flushCurrent("document-switch"))
      .rejects.toThrow("changed outside the editor");
  });

  it("surfaces a failed conditional write and keeps the dirty snapshot retryable", async () => {
    const persist = vi.fn()
      .mockRejectedValueOnce(new Error("File changed outside PuppyOne"))
      .mockResolvedValueOnce({ version: "v3" });
    const session = createSession(persist, "manual");
    const source = bindSource(session, { revision: "r1", content: "one" });
    source.change({ revision: "r2", content: "two" });

    await expect(session.flushCurrent("document-switch")).rejects.toThrow("outside PuppyOne");
    expect(session.hasUnpersistedChanges()).toBe(true);
    expect(session.getState()).toMatchObject({
      status: "error",
      error: { code: "persistence-failed", detail: "File changed outside PuppyOne" },
    });

    await session.requestSave();
    expect(session.hasUnpersistedChanges()).toBe(false);
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("settles the drain when an adapter throws before returning a Promise", async () => {
    const session = createSession(() => {
      throw new Error("Desktop bridge unavailable");
    }, "manual");
    const source = bindSource(session, { revision: "r1", content: "one" });
    source.change({ revision: "r2", content: "two" });

    await expect(session.flushCurrent("document-switch"))
      .rejects.toThrow("Desktop bridge unavailable");
    expect(session.getState()).toMatchObject({
      status: "error",
      error: { code: "persistence-failed", detail: "Desktop bridge unavailable" },
    });
  });
});

function createSession(
  persist: DocumentPersistencePort["persist"],
  saveMode: "auto" | "manual" = "auto",
) {
  return new DocumentEditingSession({
    documentId: "notes.md",
    initialContent: "one",
    initialVersion: "v1",
    saveMode,
    persistence: { kind: "local-fs", persist },
  });
}

function bindSource(
  session: DocumentEditingSession,
  initialSnapshot: EditorSourceSnapshot,
) {
  let snapshot = initialSnapshot;
  const detach = session.attachSource({
    readSnapshot: () => snapshot,
    replaceContent: (content) => {
      snapshot = { revision: `${snapshot.revision}:external`, content };
      return snapshot;
    },
  });
  session.reportRevision({ revision: snapshot.revision, dirty: false });
  return {
    change(nextSnapshot: EditorSourceSnapshot, dirty = true) {
      snapshot = nextSnapshot;
      session.reportRevision({ revision: snapshot.revision, dirty });
    },
    snapshot: () => snapshot,
    detach,
  };
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
