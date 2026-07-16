import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  WORKSPACE_WATCH_REARM_MIN_DELAY_MS,
  createWorkspaceWatchService,
} from "../electron/main/workspace-watch-service.mjs";

function createFakeFsWatch() {
  const watchers = [];
  const fsModule = {
    promises: {
      readFile: vi.fn(async () => Buffer.from("after")),
    },
    watch(_rootPath, _options, listener) {
      const watcher = new EventEmitter();
      watcher.close = vi.fn();
      watcher._listener = listener;
      watchers.push(watcher);
      return watcher;
    },
  };
  return { fsModule, watchers };
}

function createSender(id = 1) {
  const events = [];
  return {
    events,
    sender: {
      id,
      isDestroyed: () => false,
      once: () => {},
      send: (channel, payload) => events.push({ channel, payload }),
    },
  };
}

describe("workspace content watch re-arm", () => {
  const timers = [];
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;

  afterEach(() => {
    for (const handle of timers.splice(0)) {
      realClearTimeout(handle);
    }
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    vi.restoreAllMocks();
  });

  it("re-arms after watcher error and broadcasts a recovery event", async () => {
    const { fsModule, watchers } = createFakeFsWatch();
    const queued = [];
    globalThis.setTimeout = ((callback, ms, ...args) => {
      const entry = { callback, ms, args };
      queued.push(entry);
      const handle = realSetTimeout(() => {}, 0);
      timers.push(handle);
      return handle;
    }) ;
    globalThis.clearTimeout = (handle) => {
      realClearTimeout(handle);
    };

    // Stub edit-review side effects by watching a temp-looking path; initialize
    // may fail harmlessly. Use a real path that exists.
    const service = createWorkspaceWatchService({
      logger: { warn: () => {}, info: () => {} },
      fsModule,
    });
    const { events, sender } = createSender(7);
    const started = service.start(sender, "/tmp");
    expect(started.subscriptionId).toBeTruthy();
    expect(watchers).toHaveLength(1);

    watchers[0].emit("error", new Error("watch failed"));
    expect(events.some((event) => event.payload?.eventType === "error")).toBe(true);

    const rearm = queued.find((entry) => entry.ms === WORKSPACE_WATCH_REARM_MIN_DELAY_MS);
    expect(rearm).toBeTruthy();
    rearm.callback();
    expect(watchers).toHaveLength(2);
    expect(events.some((event) => event.payload?.recovered === true)).toBe(true);

    // Post-recovery change events still deliver.
    const baseline = events.length;
    watchers[1]._listener("change", "file.txt");
    const debounce = queued.find((entry) => entry.ms === 200 && entry !== rearm);
    expect(debounce).toBeTruthy();
    debounce.callback();
    expect(events.length).toBeGreaterThan(baseline);
    expect(events.at(-1)?.payload?.path).toBe("file.txt");

    service.stop(started.subscriptionId);
    service.closeAll();
  });

  it("does not echo an internal save to its writer but still notifies other windows", async () => {
    const { fsModule, watchers } = createFakeFsWatch();
    const queued = [];
    globalThis.setTimeout = ((callback, ms, ...args) => {
      const entry = { callback, ms, args };
      queued.push(entry);
      const handle = realSetTimeout(() => {}, 0);
      timers.push(handle);
      return handle;
    });
    globalThis.clearTimeout = (handle) => {
      realClearTimeout(handle);
    };

    const service = createWorkspaceWatchService({
      logger: { warn: () => {}, info: () => {} },
      fsModule,
    });
    const writer = createSender(11);
    const observer = createSender(12);
    service.start(writer.sender, "/tmp");
    service.start(observer.sender, "/tmp");

    watchers[0]._listener("rename", "notes/example.md");
    expect(service.noteInternalWrite({
      rootPath: "/tmp",
      path: "notes/example.md",
      senderId: 11,
      version: fingerprint("after"),
    })).toEqual({ tracked: true });
    // Atomic replacement may emit more than one final-path event on macOS.
    watchers[0]._listener("rename", "notes/example.md");

    queued.filter((entry) => entry.ms === 200).at(-1)?.callback();
    await vi.waitFor(() => expect(observer.events).toHaveLength(1));
    expect(writer.events).toHaveLength(0);
    expect(observer.events[0]?.payload?.path).toBe("notes/example.md");

    service.closeAll();
  });

  it("correlates an internal save when fs.watch fires just after the write returns", async () => {
    const { fsModule, watchers } = createFakeFsWatch();
    const queued = [];
    globalThis.setTimeout = ((callback, ms, ...args) => {
      const entry = { callback, ms, args };
      queued.push(entry);
      const handle = realSetTimeout(() => {}, 0);
      timers.push(handle);
      return handle;
    });
    globalThis.clearTimeout = (handle) => {
      realClearTimeout(handle);
    };

    const service = createWorkspaceWatchService({
      logger: { warn: () => {}, info: () => {} },
      fsModule,
    });
    const writer = createSender(21);
    const observer = createSender(22);
    service.start(writer.sender, "/tmp");
    service.start(observer.sender, "/tmp");

    service.noteInternalWrite({
      rootPath: "/tmp",
      path: "notes/example.md",
      senderId: 21,
      version: fingerprint("after"),
    });
    watchers[0]._listener("rename", "notes/example.md");
    watchers[0]._listener("rename", "notes/example.md");
    queued.filter((entry) => entry.ms === 200).at(-1)?.callback();

    await vi.waitFor(() => expect(observer.events).toHaveLength(1));
    expect(writer.events).toHaveLength(0);

    service.closeAll();
  });

  it("does not suppress a newer external edit on the same path", async () => {
    const { fsModule, watchers } = createFakeFsWatch();
    fsModule.promises.readFile.mockResolvedValue(Buffer.from("agent update"));
    const queued = [];
    globalThis.setTimeout = ((callback, ms, ...args) => {
      const entry = { callback, ms, args };
      queued.push(entry);
      const handle = realSetTimeout(() => {}, 0);
      timers.push(handle);
      return handle;
    });
    globalThis.clearTimeout = (handle) => {
      realClearTimeout(handle);
    };

    const service = createWorkspaceWatchService({
      logger: { warn: () => {}, info: () => {} },
      fsModule,
    });
    const writer = createSender(31);
    const observer = createSender(32);
    service.start(writer.sender, "/tmp");
    service.start(observer.sender, "/tmp");

    service.noteInternalWrite({
      rootPath: "/tmp",
      path: "notes/example.md",
      senderId: 31,
      version: fingerprint("our save"),
    });
    watchers[0]._listener("change", "notes/example.md");
    queued.filter((entry) => entry.ms === 200).at(-1)?.callback();

    await vi.waitFor(() => expect(writer.events).toHaveLength(1));
    expect(observer.events).toHaveLength(1);
    expect(writer.events[0]?.payload?.path).toBe("notes/example.md");

    service.closeAll();
  });
});

function fingerprint(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
