/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDataNodeActions } from "../src/features/data-workspace/useDataNodeActions";
import { createLocalDataPort } from "../src/lib/localFiles";
import { DEFAULT_EXTERNAL_APPS_SETTINGS } from "../src/preferences";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let originalDesktopBridge: Window["puppyoneDesktop"];

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  window.puppyoneDesktop = originalDesktopBridge;
});

describe("Slides create action", () => {
  it("delegates one template intent and opens the manifest returned by the main process", async () => {
    const instantiateTemplate = vi.fn(async () => ({
      rootPath: "Untitled Slides",
      openPath: "Untitled Slides/Untitled Slides.puppyoneapp",
      createdPaths: ["Untitled Slides", "Untitled Slides/Untitled Slides.puppyoneapp"],
      template: { id: "slides.default" as const, version: 1 },
    }));
    originalDesktopBridge = window.puppyoneDesktop;
    window.puppyoneDesktop = { instantiateTemplate } as Window["puppyoneDesktop"];
    const dataPort = createLocalDataPort("/workspace");
    const setActiveDataPath = vi.fn();
    const setActiveDataNode = vi.fn();
    const onWorkspaceContentChanged = vi.fn();
    const onLocalWorkspaceContentChanged = vi.fn();
    let actions: ReturnType<typeof useDataNodeActions> | null = null;

    function Harness() {
      actions = useDataNodeActions({
        dataPort,
        externalAppsSettings: DEFAULT_EXTERNAL_APPS_SETTINGS,
        onEnterDataView: vi.fn(),
        onLocalWorkspaceContentChanged,
        onWorkspaceContentChanged,
        setActiveDataPath,
        setActiveDataNode,
        workspace: { id: "workspace", name: "Workspace", path: "/workspace", status: "recording" },
      });
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(withTestLocalization(<Harness />)));
    act(() => actions?.openCreateEntryMenu(null, {
      left: 0, top: 0, right: 20, bottom: 20, width: 20, height: 20,
    }));
    act(() => actions?.selectCreateEntryKind("slides"));
    await act(async () => actions?.createEntryFromMenu());

    expect(instantiateTemplate).toHaveBeenCalledWith({
      rootPath: "/workspace",
      templateId: "slides.default",
      parentPath: null,
      name: "Untitled Slides",
    });
    expect(instantiateTemplate).toHaveBeenCalledOnce();
    expect(setActiveDataPath).toHaveBeenCalledWith("Untitled Slides/Untitled Slides.puppyoneapp");
    expect(setActiveDataNode).toHaveBeenCalledWith(null);
    expect(onWorkspaceContentChanged).toHaveBeenCalledOnce();
    expect(onLocalWorkspaceContentChanged).toHaveBeenCalledOnce();
  });
});
