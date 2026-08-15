/** @vitest-environment happy-dom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataNode, DataPort } from "@puppyone/shared-ui";
import { useEditorPaneSource } from "../src/features/editor-workbench/runtime/useEditorPaneSource";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("editor pane source switching", () => {
  it("re-reads a content document after visiting a resource-only image", async () => {
    const readFile = vi.fn(async (path: string) => ({
      path,
      name: path,
      type: "spreadsheet" as const,
      mimeType: "text/csv",
      content: "name,value\nalpha,1",
      version: `version:${readFile.mock.calls.length}`,
    }));
    const dataPort: DataPort = {
      readFile,
      getFileUrl: vi.fn(async (path: string) => `blob:${path}`),
      listChildren: vi.fn(async () => []),
    };
    const csv = node("style-list.csv", "spreadsheet", "text/csv");
    const image = node("styles.png", "image", "image/png");
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await renderSource(csv, dataPort);
    await waitFor(() => container.dataset.contentPath === csv.path);
    expect(readFile).toHaveBeenCalledTimes(1);

    await renderSource(image, dataPort);
    await waitFor(() => container.dataset.contentPath === "");

    await renderSource(csv, dataPort);
    await waitFor(() => container.dataset.contentPath === csv.path);
    expect(readFile).toHaveBeenCalledTimes(2);
    expect(container.dataset.loading).toBe("false");

    async function renderSource(activeNode: DataNode, port: DataPort) {
      await act(async () => root?.render(<SourceProbe node={activeNode} dataPort={port} />));
    }

    function SourceProbe({ node: activeNode, dataPort: port }: {
      node: DataNode;
      dataPort: DataPort;
    }) {
      const source = useEditorPaneSource(activeNode, port);
      container.dataset.contentPath = source.content?.path ?? "";
      container.dataset.loading = String(source.loading);
      return null;
    }
  });
});

function node(path: string, type: DataNode["type"], mimeType: string): DataNode {
  return {
    id: path,
    path,
    name: path,
    type,
    mimeType,
    source: "local",
  };
}

async function waitFor(assertion: () => boolean, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (assertion()) return;
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 2)));
  }
  throw new Error("Timed out waiting for editor source state.");
}
