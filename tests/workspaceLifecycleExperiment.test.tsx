/**
 * @vitest-environment happy-dom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceLifecycle } from "../src/features/app-shell/useWorkspaceLifecycle";

const localFiles = vi.hoisted(() => ({
  attachWorkspaceFolder: vi.fn(),
  cloneRepository: vi.fn(),
  createLocalProject: vi.fn(),
  detachWorkspaceFolder: vi.fn(),
  forgetLastWorkspace: vi.fn(),
  getInitialWorkspace: vi.fn(),
  getRecentWorkspaces: vi.fn(),
  hydrateRecentWorkspaces: vi.fn(),
  openDroppedWorkspaceInCurrentWindow: vi.fn(),
  openWorkspaceInCurrentWindow: vi.fn(),
  openWorkspaceInNewWindow: vi.fn(),
  removeRecentWorkspace: vi.fn(),
  selectLocalProjectLocation: vi.fn(),
  selectWorkspaceFolder: vi.fn(),
  selectWorkspaceFolderInNewWindow: vi.fn(),
  selectWorkspaceFolderToAttach: vi.fn(),
}));

vi.mock("../src/lib/localFiles", () => localFiles);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

beforeEach(() => {
  localFiles.getInitialWorkspace.mockResolvedValue({
    path: null,
    workspace: null,
    workspaces: [],
    error: null,
  });
  localFiles.getRecentWorkspaces.mockResolvedValue({ workspaces: [], errors: [] });
  localFiles.hydrateRecentWorkspaces.mockResolvedValue({ workspaces: [], errors: [], hydrated: true });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("multi-project Workspace experiment", () => {
  it("blocks both Project attachment paths while the experiment is off", async () => {
    const onWorkspaceOpenSettled = vi.fn();
    const controller = await renderHarness(false, onWorkspaceOpenSettled);

    await act(async () => controller.addProject());
    await act(async () => controller.addExistingProject("/projects/second"));

    expect(localFiles.selectWorkspaceFolderToAttach).not.toHaveBeenCalled();
    expect(localFiles.attachWorkspaceFolder).not.toHaveBeenCalled();
    expect(onWorkspaceOpenSettled).toHaveBeenCalledTimes(2);
  });

  it("allows both Project attachment paths after the experiment is enabled", async () => {
    localFiles.selectWorkspaceFolderToAttach.mockResolvedValue(null);
    localFiles.attachWorkspaceFolder.mockResolvedValue({
      status: "focused-existing",
      path: "/projects/second",
      workspace: null,
      workspaces: [],
    });
    const controller = await renderHarness(true, vi.fn());

    await act(async () => controller.addProject());
    await act(async () => controller.addExistingProject("/projects/second"));

    expect(localFiles.selectWorkspaceFolderToAttach).toHaveBeenCalledOnce();
    expect(localFiles.attachWorkspaceFolder).toHaveBeenCalledWith("/projects/second");
  });
});

async function renderHarness(
  multiRootWorkspacesEnabled: boolean,
  onWorkspaceOpenSettled: () => void,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  let controller: ReturnType<typeof useWorkspaceLifecycle> | null = null;
  const onWorkspaceActivated = vi.fn();
  const onWorkspaceCleared = vi.fn();

  function Harness() {
    controller = useWorkspaceLifecycle({
      multiRootWorkspacesEnabled,
      onWorkspaceActivated,
      onWorkspaceCleared,
      onWorkspaceOpenSettled,
    });
    return null;
  }

  await act(async () => root?.render(<Harness />));
  if (!controller) throw new Error("Workspace lifecycle controller did not initialize.");
  return controller;
}
