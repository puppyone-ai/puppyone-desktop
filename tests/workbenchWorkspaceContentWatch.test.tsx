/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceFolder, type Workspace } from "@puppyone/shared-ui";
import { useWorkbenchWorkspaceContentWatch } from "../src/features/data-workspace/useWorkbenchWorkspaceContentWatch";
import type { WorkspaceChangedEvent } from "../src/types/electron";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  Reflect.deleteProperty(window, "puppyoneDesktop");
  vi.restoreAllMocks();
});

describe("Workbench Workspace content watch", () => {
  it("owns every Folder watch outside Git and preserves the originating Folder identity", async () => {
    const callbacks = new Map<string, (event: WorkspaceChangedEvent) => void>();
    const stops: Array<ReturnType<typeof vi.fn>> = [];
    const watchWorkspace = vi.fn((rootPath: string, callback: (event: WorkspaceChangedEvent) => void) => {
      callbacks.set(rootPath, callback);
      const stop = vi.fn();
      stops.push(stop);
      return {
        stop,
        ready: Promise.resolve({ subscriptionId: rootPath, rootPath }),
      };
    });
    Object.defineProperty(window, "puppyoneDesktop", {
      configurable: true,
      value: { watchWorkspace },
    });

    const first = createWorkspaceFolder(workspace("first", "/workspace/first"));
    const second = createWorkspaceFolder(workspace("second", "/workspace/second"), { index: 1 });
    const onWorkspaceContentChanged = vi.fn();
    const onWorkspaceActivity = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    function Probe() {
      useWorkbenchWorkspaceContentWatch({
        folders: [first, second],
        onWorkspaceContentChanged,
        onWorkspaceActivity,
      });
      return null;
    }

    await act(async () => root.render(<Probe />));
    expect(watchWorkspace).toHaveBeenCalledTimes(2);

    await act(async () => callbacks.get(first.workspace.path)?.({
      rootPath: first.workspace.path,
      eventType: "change",
      path: "README.md",
    }));
    await act(async () => callbacks.get(second.workspace.path)?.({
      rootPath: second.workspace.path,
      eventType: "change",
      path: "README.md",
    }));

    expect(onWorkspaceContentChanged).toHaveBeenNthCalledWith(1, "README.md", first.id);
    expect(onWorkspaceContentChanged).toHaveBeenNthCalledWith(2, "README.md", second.id);
    expect(onWorkspaceActivity).toHaveBeenNthCalledWith(1, first);
    expect(onWorkspaceActivity).toHaveBeenNthCalledWith(2, second);

    await act(async () => callbacks.get(first.workspace.path)?.({
      rootPath: first.workspace.path,
      eventType: "error",
      path: null,
      error: "watch failed",
    }));
    expect(onWorkspaceContentChanged).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
    expect(stops.every((stop) => stop.mock.calls.length === 1)).toBe(true);
  });
});

function workspace(id: string, path: string): Workspace {
  return {
    id,
    workspaceInstanceId: id,
    name: id,
    path,
    status: "recording",
  };
}
