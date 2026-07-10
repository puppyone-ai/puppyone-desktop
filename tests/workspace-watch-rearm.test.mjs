import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  WORKSPACE_WATCH_REARM_MIN_DELAY_MS,
  createWorkspaceWatchService,
} from "../electron/main/workspace-watch-service.mjs";

function createFakeFsWatch() {
  const watchers = [];
  const fsModule = {
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
});
