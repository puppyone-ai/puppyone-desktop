import { describe, expect, it } from "vitest";
import {
  attachMarkdownFormatShortcuts,
  matchMarkdownFormatInput,
  MARKDOWN_FORMAT_SHORTCUT_CHANNEL,
  registerMarkdownFormatIpcHandlers,
  setMarkdownFormatShortcutsActive,
} from "../electron/main/ipc/markdown-format-ipc.mjs";

describe("Markdown format window shortcuts", () => {
  it("matches Cmd/Ctrl format keys and ignores auto-repeat", () => {
    expect(matchMarkdownFormatInput({
      type: "keyDown",
      key: "i",
      meta: true,
    }, "darwin")).toBe("emphasis");
    expect(matchMarkdownFormatInput({
      type: "keyDown",
      key: "u",
      control: true,
    }, "win32")).toBe("underline");
    expect(matchMarkdownFormatInput({
      type: "keyDown",
      key: "d",
      meta: true,
    }, "darwin")).toBe("strike");
    expect(matchMarkdownFormatInput({
      type: "keyDown",
      key: "i",
      meta: true,
      isAutoRepeat: true,
    }, "darwin")).toBeNull();
  });

  it("prevents default and forwards the shortcut only while a Markdown editor is focused", () => {
    const sent = [];
    const listeners = new Map();
    const webContents = {
      id: 17,
      isDestroyed: () => false,
      send(channel, payload) {
        sent.push({ channel, payload });
      },
      on(channel, listener) {
        listeners.set(channel, listener);
      },
      once() {},
      removeListener() {},
    };

    attachMarkdownFormatShortcuts(webContents);
    const beforeInput = listeners.get("before-input-event");
    const event = { preventDefault() { event.prevented = true; }, prevented: false };

    beforeInput(event, { type: "keyDown", key: "i", meta: true });
    expect(event.prevented).toBe(false);
    expect(sent).toEqual([]);

    setMarkdownFormatShortcutsActive(17, true);
    beforeInput(event, { type: "keyDown", key: "i", meta: true });
    expect(event.prevented).toBe(true);
    expect(sent).toEqual([
      { channel: MARKDOWN_FORMAT_SHORTCUT_CHANNEL, payload: { type: "emphasis" } },
    ]);
  });

  it("updates the focused editor from trusted IPC", () => {
    const sent = [];
    const listeners = new Map();
    const webContents = {
      id: 21,
      isDestroyed: () => false,
      send(channel, payload) {
        sent.push({ channel, payload });
      },
      on(channel, listener) {
        listeners.set(channel, listener);
      },
      once() {},
      removeListener() {},
    };
    attachMarkdownFormatShortcuts(webContents);

    const ipcListeners = new Map();
    registerMarkdownFormatIpcHandlers({
      ipcMain: {
        on(channel, listener) {
          ipcListeners.set(channel, listener);
        },
      },
    });

    ipcListeners.get("editor:markdown-format-active")({ sender: { id: 21 } }, { active: true });
    const beforeInput = listeners.get("before-input-event");
    const event = { preventDefault() { event.prevented = true; }, prevented: false };
    beforeInput(event, { type: "keyDown", key: "b", meta: true });
    expect(sent[0]).toEqual({
      channel: MARKDOWN_FORMAT_SHORTCUT_CHANNEL,
      payload: { type: "strong" },
    });
  });
});
