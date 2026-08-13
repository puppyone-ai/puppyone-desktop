/** @vitest-environment happy-dom */
import React, { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { Workspace } from "@puppyone/shared-ui";
import {
  useDesktopEditorGroup,
  type DesktopEditorGroupController,
} from "../src/features/editor-workbench/useDesktopEditorGroup";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  window.localStorage.clear();
});

describe("useDesktopEditorGroup", () => {
  it("restores a workspace session without overwriting it during hydration", async () => {
    const workspace: Workspace = {
      id: "workspace-id",
      name: "Workspace",
      path: "/workspace",
      status: "recording",
    };
    const storageKey = "puppyone.desktop.editor-group.v1:workspace-id:/workspace";
    window.localStorage.setItem(storageKey, JSON.stringify({
      editors: [
        { id: "a.md", resource: "a.md", label: "a.md" },
        { id: "b.md", resource: "b.md", label: "b.md" },
      ],
      activeEditorId: "b.md",
      mostRecentlyUsed: ["b.md", "a.md"],
    }));
    const snapshots: DesktopEditorGroupController[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Probe workspace={workspace} onChange={(controller) => snapshots.push(controller)} />);
      await Promise.resolve();
    });

    expect(snapshots.at(-1)?.state.editors.map(({ id }) => id)).toEqual(["a.md", "b.md"]);
    expect(snapshots.at(-1)?.activePath).toBe("b.md");
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? "null").activeEditorId).toBe("b.md");
  });

  it("persists pane assignments with the v2 workbench record", async () => {
    const workspace: Workspace = {
      id: "workspace-id",
      name: "Workspace",
      path: "/workspace",
      status: "recording",
    };
    const snapshots: DesktopEditorGroupController[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Probe workspace={workspace} onChange={(controller) => snapshots.push(controller)} />);
      await Promise.resolve();
    });
    await act(async () => {
      const controller = snapshots.at(-1)!;
      controller.open("a.md");
      controller.splitPane(controller.activePaneId, "horizontal");
      await Promise.resolve();
    });
    await act(async () => {
      snapshots.at(-1)!.open("b.md");
      await Promise.resolve();
    });

    const storageKey = "puppyone.desktop.editor-workbench.v2:workspace-id:/workspace";
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
    expect(stored.group.editors.map(({ id }: { id: string }) => id)).toEqual(["a.md", "b.md"]);
    expect(stored.layout).toMatchObject({
      activePaneId: "editor-pane-2",
      root: {
        kind: "split",
        direction: "horizontal",
        first: { editorId: "a.md" },
        second: { editorId: "b.md" },
      },
    });
  });
});

function Probe({
  workspace,
  onChange,
}: {
  workspace: Workspace;
  onChange: (controller: DesktopEditorGroupController) => void;
}) {
  const controller = useDesktopEditorGroup(workspace);
  useEffect(() => {
    onChange(controller);
  }, [controller, onChange]);
  return null;
}
