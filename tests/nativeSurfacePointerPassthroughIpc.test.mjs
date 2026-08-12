import { describe, expect, it, vi } from "vitest";
import {
  NATIVE_SURFACE_POINTER_PASSTHROUGH_CHANNEL,
  registerNativeSurfacePointerPassthroughIpcHandlers,
} from "../electron/main/ipc/native-surface-pointer-passthrough-ipc.mjs";

describe("native surface pointer passthrough IPC", () => {
  it("derives the owner from Electron's sender and ignores malformed state", () => {
    const listeners = new Map();
    const coordinator = { setOwnerActive: vi.fn() };
    registerNativeSurfacePointerPassthroughIpcHandlers({
      ipcMain: { on: (channel, listener) => listeners.set(channel, listener) },
      coordinator,
    });
    const listener = listeners.get(NATIVE_SURFACE_POINTER_PASSTHROUGH_CHANNEL);

    listener({ sender: { id: 42 } }, { ownerWebContentsId: 999, active: true });
    listener({ sender: { id: 42 } }, { active: "true" });
    listener({ sender: { id: 0 } }, { active: false });

    expect(coordinator.setOwnerActive).toHaveBeenCalledOnce();
    expect(coordinator.setOwnerActive).toHaveBeenCalledWith(42, true);
  });
});
