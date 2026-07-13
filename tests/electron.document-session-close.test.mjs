import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  createApplicationQuitIntent,
  createDocumentSessionCloseCoordinator,
  DOCUMENT_SESSION_CLOSE_CANCELLED_CHANNEL,
  DOCUMENT_SESSION_FLUSH_REQUEST_CHANNEL,
  DOCUMENT_SESSION_FLUSH_RESULT_CHANNEL,
} from "../electron/main/document-session-close-coordinator.mjs";

describe("Electron application quit intent", () => {
  it("resumes a macOS quit after the asynchronous last-window drain", () => {
    const app = { quit: vi.fn() };
    const intent = createApplicationQuitIntent({ app, platform: "darwin" });

    intent.resumeAfterLastWindowClosed();
    expect(app.quit).not.toHaveBeenCalled();

    intent.markRequested();
    intent.resumeAfterLastWindowClosed();
    expect(app.quit).toHaveBeenCalledOnce();
  });

  it("cancels quit intent when a failed document window stays open", () => {
    const app = { quit: vi.fn() };
    const intent = createApplicationQuitIntent({ app, platform: "darwin" });
    intent.markRequested();
    intent.cancel();

    intent.resumeAfterLastWindowClosed();
    expect(app.quit).not.toHaveBeenCalled();
  });

  it("retains the native non-macOS last-window quit behavior", () => {
    const app = { quit: vi.fn() };
    const intent = createApplicationQuitIntent({ app, platform: "win32" });

    intent.resumeAfterLastWindowClosed();
    expect(app.quit).toHaveBeenCalledOnce();
  });
});

describe("Electron document close coordination", () => {
  it("keeps the window alive until the renderer drains all Document Sessions", async () => {
    const harness = createHarness();
    harness.window.webContents.emit("did-finish-load");

    const firstClose = harness.window.requestClose();
    expect(firstClose.preventDefault).toHaveBeenCalledOnce();
    expect(harness.window.destroyed).toBe(false);
    const request = harness.window.webContents.sent[0];
    expect(request.channel).toBe(DOCUMENT_SESSION_FLUSH_REQUEST_CHANNEL);

    harness.reply(request.payload.requestId, { ok: true });
    await nextMicrotask();

    expect(harness.window.destroyed).toBe(true);
    expect(harness.dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it("keeps the window open when persistence fails and the user declines data loss", async () => {
    const onCloseCancelled = vi.fn();
    const harness = createHarness({ dialogResponse: 0, onCloseCancelled });
    harness.window.webContents.emit("did-finish-load");
    harness.window.requestClose();
    const request = harness.window.webContents.sent[0];

    harness.reply(request.payload.requestId, { ok: false, error: "File changed outside PuppyOne" });
    await nextMicrotask();

    expect(harness.dialog.showMessageBox).toHaveBeenCalledWith(
      harness.window,
      expect.objectContaining({
        defaultId: 0,
        cancelId: 0,
        detail: "Keep the window open and try again to avoid losing changes.",
      }),
    );
    expect(harness.window.destroyed).toBe(false);
    expect(onCloseCancelled).toHaveBeenCalledWith(harness.window);
    expect(harness.window.webContents.sent[1]).toEqual({
      channel: DOCUMENT_SESSION_CLOSE_CANCELLED_CHANNEL,
      payload: { requestId: request.payload.requestId },
    });

    // Declining the destructive choice returns the coordinator to an idle
    // state, so a later close can retry persistence.
    harness.window.requestClose();
    const flushRequests = harness.window.webContents.sent.filter(
      ({ channel }) => channel === DOCUMENT_SESSION_FLUSH_REQUEST_CHANNEL,
    );
    expect(flushRequests).toHaveLength(2);
    const retry = flushRequests[1];
    harness.reply(retry.payload.requestId, { ok: true });
    await nextMicrotask();
    expect(harness.window.destroyed).toBe(true);
  });

  it("ignores a forged acknowledgement from a different renderer", async () => {
    const harness = createHarness();
    harness.window.webContents.emit("did-finish-load");
    harness.window.requestClose();
    const requestId = harness.window.webContents.sent[0].payload.requestId;

    harness.reply(requestId, { ok: true }, { id: 999 });
    await nextMicrotask();
    expect(harness.window.destroyed).toBe(false);

    harness.reply(requestId, { ok: true });
    await nextMicrotask();
    expect(harness.window.destroyed).toBe(true);
  });

  it("does not block a window that never loaded an editor renderer", () => {
    const harness = createHarness();
    const event = harness.window.requestClose();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(harness.window.destroyed).toBe(true);
    expect(harness.window.webContents.sent).toHaveLength(0);
  });
});

function createHarness({ dialogResponse = 0, onCloseCancelled = () => undefined } = {}) {
  let resultListener = null;
  const trustedIpc = {
    on: vi.fn((channel, listener) => {
      expect(channel).toBe(DOCUMENT_SESSION_FLUSH_RESULT_CHANNEL);
      resultListener = listener;
    }),
  };
  const dialog = {
    showMessageBox: vi.fn(async () => ({ response: dialogResponse })),
  };
  const coordinator = createDocumentSessionCloseCoordinator({
    dialog,
    timeoutMs: 1_000,
    logger: { error: vi.fn() },
    onCloseCancelled,
  });
  coordinator.registerIpc(trustedIpc);
  const window = new FakeWindow();
  coordinator.attachWindow(window);

  return {
    dialog,
    window,
    reply(requestId, payload, sender = window.webContents) {
      resultListener({ sender }, { requestId, ...payload });
    },
  };
}

class FakeWindow extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.webContents = new FakeWebContents();
  }

  isDestroyed() {
    return this.destroyed;
  }

  close() {
    return this.requestClose();
  }

  requestClose() {
    const event = { preventDefault: vi.fn() };
    this.emit("close", event);
    if (event.preventDefault.mock.calls.length === 0) {
      this.destroyed = true;
      this.webContents.destroyed = true;
      this.emit("closed");
    }
    return event;
  }
}

class FakeWebContents extends EventEmitter {
  constructor() {
    super();
    this.id = 42;
    this.destroyed = false;
    this.sent = [];
  }

  isDestroyed() {
    return this.destroyed;
  }

  send(channel, payload) {
    this.sent.push({ channel, payload });
  }
}

async function nextMicrotask() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
