/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PuppyoneEditorHost } from "../packages/shared-ui/src/editor/PuppyoneEditorHost";
import { EMPTY_VIEWER_PACK_SNAPSHOT } from "../packages/shared-ui/src/editor/viewerPackTypes";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("preset viewer host composition", () => {
  it("keeps an unknown document on the honest preset placeholder by default", () => {
    const container = renderHost({
      document: {
        path: "assets/scene.glb",
        name: "scene.glb",
        type: "binary",
        mimeType: "model/gltf-binary",
        sourceKind: "local",
      },
    });

    expect(container.querySelector(".document-preview")).not.toBeNull();
    expect(container.textContent).toContain("Binary file");
    expect(container.querySelector('[data-testid="install-viewer"]')).toBeNull();
  });

  it("renders loading and recoverable error states before mounting a content viewer", async () => {
    const loadingContainer = renderHost({
      document: { path: "notes.txt", name: "notes.txt", type: "text" },
      loading: true,
    });
    expect(loadingContainer.textContent).toContain("Loading file...");

    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";

    const openExternalFile = vi.fn(async () => undefined);
    const errorContainer = renderHost({
      document: { path: "notes.txt", name: "notes.txt", type: "text" },
      error: "Read failed",
      openExternalFile,
    });
    expect(errorContainer.textContent).toContain("Cannot open in editor");
    expect(errorContainer.textContent).toContain("Read failed");

    const button = errorContainer.querySelector("button");
    expect(button?.textContent).toContain("Open in default app");
    await act(async () => button?.click());
    expect(openExternalFile).toHaveBeenCalledWith("notes.txt");
  });

  it("invokes the external extension port only when the host explicitly provides it", () => {
    const container = renderHost({
      document: {
        path: "assets/scene.glb",
        name: "scene.glb",
        type: "binary",
        sourceKind: "local",
      },
      viewerExtensionAdapter: {
        snapshot: EMPTY_VIEWER_PACK_SNAPSHOT,
        renderInstallFallback: ({ document: input }) => React.createElement(
          "button",
          { "data-testid": "install-viewer" },
          `Install viewer for ${input.name}`,
        ),
      },
    });

    expect(container.querySelector(".document-preview")).toBeNull();
    expect(container.querySelector('[data-testid="install-viewer"]')?.textContent)
      .toBe("Install viewer for scene.glb");
  });

  it("never offers local extension installation for cloud documents", () => {
    const container = renderHost({
      document: {
        path: "assets/scene.glb",
        name: "scene.glb",
        type: "binary",
        sourceKind: "cloud",
      },
      viewerExtensionAdapter: {
        snapshot: EMPTY_VIEWER_PACK_SNAPSHOT,
        renderInstallFallback: () => React.createElement("button", {
          "data-testid": "install-viewer",
        }),
      },
    });

    expect(container.querySelector('[data-testid="install-viewer"]')).toBeNull();
    expect(container.querySelector(".document-preview")).not.toBeNull();
  });
});

function renderHost(props: React.ComponentProps<typeof PuppyoneEditorHost>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(React.createElement(PuppyoneEditorHost, props)));
  return container;
}
