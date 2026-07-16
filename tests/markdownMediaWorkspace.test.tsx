/**
 * @vitest-environment happy-dom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataNode, DataPort } from "../packages/shared-ui/src/core/types";
import { DataWorkspace } from "../packages/shared-ui/src/data/DataWorkspace";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("Markdown workspace media integration", () => {
  it("resolves a standard Markdown image relative to the active document", async () => {
    const markdownPath = "Puppyone — One Pager.md";
    const imagePath = "asserts/market-unbundling-chart.png";
    const getFileUrl = vi.fn(async () => "blob:https://app/market-unbundling-chart");
    const readFile = vi.fn(async (path: string) => ({
      path,
      name: markdownPath,
      type: "markdown",
      content: [
        "<table><tr><td>Header</td></tr></table>",
        "",
        "## Market",
        "",
        `![market-unbundling](${imagePath})`,
      ].join("\n"),
      mimeType: "text/markdown",
      size: "1 KB",
      version: "v1",
    }));
    const dataPort: DataPort = {
      listChildren: vi.fn(async (folderPath) => {
        if (folderPath === "asserts") return [imageNode(imagePath)];
        return [markdownNode(markdownPath), folderNode()];
      }),
      readFile,
      getFileUrl,
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(withTestLocalization(
        <DataWorkspace
          workspace={{ id: "workspace", name: "VC pitch", path: "/workspace", status: "recording" }}
          dataPort={dataPort}
          defaultActivePath={markdownPath}
          showHeader={false}
          showPreviewHeader={false}
          enableMarkdownLinkContentIndexing={false}
        />,
      ));
    });

    await waitFor(() => container.querySelector(".cm-md-image-widget img") !== null);

    expect(getFileUrl).toHaveBeenCalledWith(imagePath, { purpose: "markdown-asset" });
    expect(container.querySelector<HTMLImageElement>(".cm-md-image-widget img")?.src)
      .toBe("blob:https://app/market-unbundling-chart");
  });
});

function markdownNode(path: string): DataNode {
  return {
    id: path,
    path,
    name: path,
    type: "markdown",
    mimeType: "text/markdown",
  };
}

function folderNode(): DataNode {
  return {
    id: "asserts",
    path: "asserts",
    name: "asserts",
    type: "folder",
  };
}

function imageNode(path: string): DataNode {
  return {
    id: path,
    path,
    name: "market-unbundling-chart.png",
    type: "image",
    mimeType: "image/png",
  };
}

async function waitFor(assertion: () => boolean, attempts = 150): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (assertion()) return;
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 2));
    });
  }
  throw new Error("Timed out waiting for Markdown media state.");
}
