/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorDocumentHost } from "../packages/shared-ui/src/editor/host/EditorDocumentHost";
import { preloadPresetViewer } from "../packages/shared-ui/src/editor/host/PresetViewerRenderer";
import { resolveEditorViewer } from "../packages/shared-ui/src/editor/registry/viewerRegistry";
import {
  createDefaultContextMapDocumentContent,
  parseContextMapDocument,
  type DataNode,
} from "@puppyone/shared-ui";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("Context Map Document Session integration", () => {
  it("opens as a standard editable file and persists disclosure state through the host session", async () => {
    const persist = vi.fn(async () => ({ ok: true as const, version: "v2" }));
    const source = createDefaultContextMapDocumentContent();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const contextMapDocument = {
      path: "Knowledge.contextmap",
      name: "Knowledge.contextmap",
      type: "context-map",
      sourceKind: "local" as const,
      content: source,
      version: "v1",
    };
    await preloadPresetViewer(resolveEditorViewer(contextMapDocument).viewer);

    await act(async () => root?.render(withTestLocalization(
      <EditorDocumentHost
        document={contextMapDocument}
        contextMapEnvironment={{
          revision: 1,
          listChildren: async (path) => path === null ? [folder("Civil Law")] : [],
        }}
        documentPersistence={{ kind: "local-fs", storageIdentity: "test:context-map", persist }}
        saveMode="auto"
      />,
    )));

    await vi.waitFor(() => {
      expect(container.querySelector<HTMLButtonElement>(
        'button.folder-relationship-card[data-node-path="Civil Law"]',
      ))
        .not.toBeNull();
    });
    act(() => container.querySelector<HTMLButtonElement>(
      'button.folder-relationship-card[data-node-path="Civil Law"]',
    )?.click());

    await vi.waitFor(() => expect(persist).toHaveBeenCalled());
    const persistedContent = persist.mock.calls.at(-1)?.[0].content ?? "";
    expect(parseContextMapDocument(persistedContent)).toMatchObject({
      ok: true,
      document: { layout: { expanded: ["Civil Law"] } },
    });
  });
});

function folder(path: string): DataNode {
  return {
    id: path,
    name: path,
    path,
    type: "folder",
    source: "local",
  };
}
