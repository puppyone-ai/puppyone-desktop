/**
 * @vitest-environment happy-dom
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataWorkspace } from "../packages/shared-ui/src/data/DataWorkspace";
import type { DataNode, FileContent } from "../packages/shared-ui/src/core/types";
import { createLocalDataPort } from "../src/lib/localFiles";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let temporaryWorkspace: string | null = null;
let originalDesktopBridge: Window["puppyoneDesktop"];

afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  window.puppyoneDesktop = originalDesktopBridge;
  if (temporaryWorkspace) await rm(temporaryWorkspace, { recursive: true, force: true });
  temporaryWorkspace = null;
  vi.restoreAllMocks();
});

describe("local Markdown editor persistence", () => {
  it("persists a real CodeMirror edit through DataWorkspace and the local desktop bridge", async () => {
    const fixture = await createLocalWorkspace({ "note.md": "alpha" });
    const bridge = createFilesystemBridge(fixture.root, fixture.nodes);
    originalDesktopBridge = window.puppyoneDesktop;
    window.puppyoneDesktop = bridge as Window["puppyoneDesktop"];

    const container = await renderWorkspace(fixture.root, "note.md");
    const editor = await waitForEditor(container);

    act(() => editor.dispatch({
      changes: { from: editor.state.doc.length, insert: " beta" },
      userEvent: "input.type",
    }));

    await waitFor(async () => (await readFile(join(fixture.root, "note.md"), "utf8")) === "alpha beta");

    expect(bridge.writeFile).toHaveBeenCalledWith(expect.objectContaining({
      rootPath: fixture.root,
      path: "note.md",
      content: "alpha beta",
      expectedVersion: fingerprint("alpha"),
    }));
    expect(await readFile(join(fixture.root, "note.md"), "utf8")).toBe("alpha beta");
  });

  it("keeps the local editor mounted when its pre-navigation save fails", async () => {
    const fixture = await createLocalWorkspace({
      "alpha.md": "alpha",
      "bravo.md": "bravo",
    });
    const bridge = createFilesystemBridge(fixture.root, fixture.nodes);
    const persistToDisk = bridge.writeFile.getMockImplementation();
    if (!persistToDisk) throw new Error("Filesystem bridge write implementation is unavailable.");
    let remainingFailures = 2;
    bridge.writeFile.mockImplementation(async (request) => {
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        throw new Error("disk unavailable");
      }
      return persistToDisk(request);
    });
    originalDesktopBridge = window.puppyoneDesktop;
    window.puppyoneDesktop = bridge as Window["puppyoneDesktop"];

    const container = await renderWorkspace(fixture.root, "alpha.md");
    const editor = await waitForEditor(container);
    act(() => editor.dispatch({
      changes: { from: editor.state.doc.length, insert: " changed" },
      userEvent: "input.type",
    }));
    await waitFor(() => container.querySelector(".editor-inline-error") !== null);

    const nextFile = container.querySelector<HTMLElement>('[data-explorer-path="bravo.md"]');
    if (!nextFile) throw new Error("Second local Markdown file is unavailable.");
    act(() => nextFile.click());
    await waitFor(() => bridge.writeFile.mock.calls.length >= 2);

    expect(container.querySelector('[data-explorer-path="alpha.md"]')?.getAttribute("aria-current"))
      .toBe("true");
    expect(getMountedEditor(container).state.doc.toString()).toBe("alpha changed");
    expect(await readFile(join(fixture.root, "alpha.md"), "utf8")).toBe("alpha");
  });
});

async function createLocalWorkspace(files: Record<string, string>) {
  const rootPath = await mkdtemp(join(tmpdir(), "puppyone-local-editor-"));
  temporaryWorkspace = rootPath;
  await Promise.all(Object.entries(files).map(([path, content]) => (
    writeFile(join(rootPath, path), content, "utf8")
  )));
  const nodes: DataNode[] = Object.keys(files).map((path) => ({
    id: path,
    path,
    name: path,
    type: "markdown",
  }));
  return { root: rootPath, nodes };
}

function createFilesystemBridge(rootPath: string, nodes: DataNode[]) {
  const listFolderChildren = vi.fn(async (request: { rootPath: string; folderPath: string | null }) => {
    expect(request.rootPath).toBe(rootPath);
    return request.folderPath === null ? nodes : [];
  });
  const readWorkspaceFile = vi.fn(async (request: { rootPath: string; path: string }): Promise<FileContent> => {
    expect(request.rootPath).toBe(rootPath);
    const content = await readFile(join(rootPath, request.path), "utf8");
    return {
      path: request.path,
      name: request.path,
      type: "markdown",
      content,
      version: fingerprint(content),
    };
  });
  const writeWorkspaceFile = vi.fn(async (request: {
    rootPath: string;
    path: string;
    content: string;
    expectedVersion?: string | null;
  }) => {
    expect(request.rootPath).toBe(rootPath);
    const absolutePath = join(rootPath, request.path);
    const currentContent = await readFile(absolutePath, "utf8");
    if (request.expectedVersion && request.expectedVersion !== fingerprint(currentContent)) {
      throw new Error("local file version conflict");
    }
    await writeFile(absolutePath, request.content, "utf8");
    return { version: fingerprint(request.content) };
  });
  return {
    listFolderChildren,
    readFile: readWorkspaceFile,
    writeFile: writeWorkspaceFile,
  };
}

async function renderWorkspace(rootPath: string, activePath: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(withTestLocalization(
      <DataWorkspace
        workspace={{ id: rootPath, name: "Local", path: rootPath, status: "recording" }}
        dataPort={createLocalDataPort(rootPath)}
        defaultActivePath={activePath}
        editorSaveMode="auto"
        showHeader={false}
        showPreviewHeader={false}
        hidePreviewSourceView
        enableMarkdownLinkContentIndexing={false}
      />,
    ));
  });
  return container;
}

async function waitForEditor(container: HTMLElement): Promise<EditorView> {
  let view: EditorView | null = null;
  try {
    await waitFor(() => {
      const editor = container.querySelector<HTMLElement>(".cm-editor");
      if (!editor) return false;
      view = EditorView.findFromDOM(editor);
      return true;
    });
  } catch {
    throw new Error(`CodeMirror editor did not mount: ${container.textContent ?? ""}`);
  }
  if (!view) throw new Error(`CodeMirror editor did not mount: ${container.textContent ?? ""}`);
  return view;
}

function getMountedEditor(container: HTMLElement): EditorView {
  const editor = container.querySelector<HTMLElement>(".cm-editor");
  if (!editor) throw new Error("CodeMirror editor is not mounted.");
  return EditorView.findFromDOM(editor);
}

async function waitFor(assertion: () => boolean | Promise<boolean>, attempts = 200): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await assertion()) return;
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 5));
    });
  }
  throw new Error("Timed out waiting for local Markdown editor state.");
}

function fingerprint(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
