import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("workspace folder drop preload boundary", () => {
  it("derives the path from the native File grant before invoking main", async () => {
    const folder = { name: "Notes" };
    const invoke = vi.fn(async () => ({ status: "opened-current" }));
    const bridge = await loadPreloadBridge({
      invoke,
      getPathForFile: (value) => value === folder ? "/Users/example/Notes" : "",
    });

    await expect(bridge.openDroppedWorkspaceInCurrentWindow(folder)).resolves.toEqual({ status: "opened-current" });
    expect(invoke).toHaveBeenCalledWith("workspace:open-dropped-current", "/Users/example/Notes");
  });

  it("fails closed when Electron cannot resolve the dropped File", async () => {
    const invoke = vi.fn(async () => ({ status: "opened-current" }));
    const bridge = await loadPreloadBridge({ invoke, getPathForFile: () => "" });

    await expect(bridge.openDroppedWorkspaceInCurrentWindow({ name: "Notes" })).rejects.toThrow(/could not be resolved/i);
    expect(invoke).not.toHaveBeenCalled();
  });
});

async function loadPreloadBridge({ invoke, getPathForFile }) {
  const source = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  let exposed = null;
  const context = {
    process: { argv: ["electron", "app"] },
    require: (specifier) => {
      if (specifier !== "electron") throw new Error(`Unexpected preload import: ${specifier}`);
      return {
        contextBridge: {
          exposeInMainWorld: (_name, value) => { exposed = value; },
        },
        ipcRenderer: {
          invoke,
          on: () => undefined,
          removeListener: () => undefined,
          send: () => undefined,
        },
        webUtils: { getPathForFile },
      };
    },
    console,
    Promise,
    Error,
  };
  vm.runInNewContext(source, context, { filename: "preload.cjs" });
  return exposed;
}
