/**
 * @vitest-environment happy-dom
 */
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DataNode, Workspace } from "@puppyone/shared-ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_EXTERNAL_APPS_SETTINGS } from "../src/preferences";
import type { WorkspaceExternalOpenTarget } from "../src/types/electron";
import { useActiveExternalOpenTarget } from "../src/features/external-apps/useActiveExternalOpenTarget";
import { resolveWorkspaceExternalOpenTarget } from "../src/lib/localFiles";

vi.mock("../src/lib/localFiles", () => ({
  openWorkspaceEntryExternal: vi.fn(),
  resolveWorkspaceExternalOpenTarget: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const workspace: Workspace = {
  id: "workspace-1",
  name: "Workspace",
  path: "/workspace",
  status: "recording",
};
const resolvedTarget: WorkspaceExternalOpenTarget = {
  appName: "Obsidian",
  appPath: "/Applications/Obsidian.app",
  bundleId: "md.obsidian",
  extension: "md",
  iconDataUrl: "data:image/png;base64,icon",
  source: "system",
};

let root: Root | null = null;

beforeEach(() => {
  vi.mocked(resolveWorkspaceExternalOpenTarget).mockResolvedValue(resolvedTarget);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("active external-open target", () => {
  it("does not reload the app icon when only active Markdown content changes", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await renderHarness(container, createMarkdownNode("before"));
    expect(resolveWorkspaceExternalOpenTarget).toHaveBeenCalledTimes(1);
    expect(readSnapshot(container)).toEqual({
      iconDataUrl: resolvedTarget.iconDataUrl,
      loading: "false",
      title: "Open note.md in Obsidian",
    });

    await renderHarness(container, createMarkdownNode("after"));

    expect(resolveWorkspaceExternalOpenTarget).toHaveBeenCalledTimes(1);
    expect(readSnapshot(container)).toEqual({
      iconDataUrl: resolvedTarget.iconDataUrl,
      loading: "false",
      title: "Open note.md in Obsidian",
    });
  });

  it("does resolve again when the selected file identity changes", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await renderHarness(container, createMarkdownNode("first"));
    await renderHarness(container, {
      ...createMarkdownNode("second"),
      id: "other.md",
      name: "other.md",
      path: "other.md",
    });

    expect(resolveWorkspaceExternalOpenTarget).toHaveBeenCalledTimes(2);
    expect(resolveWorkspaceExternalOpenTarget).toHaveBeenLastCalledWith(expect.objectContaining({
      path: "other.md",
    }));
  });
});

function ExternalOpenHarness({ node }: { node: DataNode }) {
  const [settings, setSettings] = useState(DEFAULT_EXTERNAL_APPS_SETTINGS);
  const target = useActiveExternalOpenTarget({
    activeDataNode: node,
    activeDataPath: node.path,
    activeViewIsData: true,
    externalAppsSettings: settings,
    onError: () => undefined,
    setExternalAppsSettings: setSettings,
    workspace,
    workspaceIsCloud: false,
  });

  return (
    <output
      data-icon-data-url={target.iconDataUrl ?? ""}
      data-loading={String(target.loading)}
      data-title={target.title ?? ""}
    />
  );
}

async function renderHarness(container: HTMLElement, node: DataNode) {
  await act(async () => {
    root?.render(<ExternalOpenHarness node={node} />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function createMarkdownNode(content: string): DataNode {
  return {
    id: "note.md",
    name: "note.md",
    path: "note.md",
    type: "markdown",
    content,
  };
}

function readSnapshot(container: HTMLElement) {
  const output = container.querySelector<HTMLOutputElement>("output");
  if (!output) throw new Error("External-open harness did not render.");
  return {
    iconDataUrl: output.dataset.iconDataUrl,
    loading: output.dataset.loading,
    title: output.dataset.title,
  };
}
