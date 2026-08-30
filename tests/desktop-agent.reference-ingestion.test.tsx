/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXPLORER_REFERENCE_DRAG_TYPE } from "@puppyone/shared-ui";
import type { AgentReferenceInputCapabilities } from "../src/features/desktop-agent/domain/agent-contract";
import { AgentComposer } from "../src/features/desktop-agent/ui/AgentComposer";
import { AgentPanelLayout } from "../src/features/desktop-agent/ui/AgentPanelLayout";
import {
  useAgentReferenceIngestion,
  type AgentWorkspaceReferenceResolver,
} from "../src/features/desktop-agent/ui/useAgentReferenceIngestion";
import { renderWithTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Desktop Agent reference ingestion", () => {
  it("uses the whole Chat as a copy drop target without nested drag flicker or automatic submission", async () => {
    const controller = controllerFixture();
    const container = render(<IngestionHarness controller={controller} />);
    const boundary = container.querySelector<HTMLElement>(".desktop-agent-boundary")!;
    const transfer = typedWorkspaceTransfer("workspace-1", ["README.md", "src"]);

    act(() => boundary.dispatchEvent(dragEvent("dragenter", transfer)));
    act(() => boundary.dispatchEvent(dragEvent("dragenter", transfer)));
    expect(container.querySelector(".desktop-agent-reference-drop-overlay")?.textContent).toContain("Drop files");
    act(() => boundary.dispatchEvent(dragEvent("dragleave", transfer)));
    expect(container.querySelector(".desktop-agent-reference-drop-overlay")).not.toBeNull();
    act(() => boundary.dispatchEvent(dragEvent("dragleave", transfer)));
    expect(container.querySelector(".desktop-agent-reference-drop-overlay")).toBeNull();

    act(() => boundary.dispatchEvent(dragEvent("dragenter", transfer)));
    await act(async () => boundary.dispatchEvent(dragEvent("drop", transfer)));
    await vi.waitFor(() => expect(controller.addWorkspacePaths).toHaveBeenCalledWith(["README.md", "src"]));
    expect(controller.submit).not.toHaveBeenCalled();
    expect(container.querySelector("[role='status']")?.textContent).toContain("2 references");
  });

  it("marks cross-workspace drags invalid and never grants their paths", async () => {
    const controller = controllerFixture();
    const container = render(<IngestionHarness controller={controller} />);
    const boundary = container.querySelector<HTMLElement>(".desktop-agent-boundary")!;
    const transfer = typedWorkspaceTransfer("another-workspace", ["secret.md"]);
    act(() => boundary.dispatchEvent(dragEvent("dragenter", transfer)));
    expect(container.querySelector(".desktop-agent-reference-drop-overlay")?.classList.contains("is-invalid")).toBe(true);
    await act(async () => boundary.dispatchEvent(dragEvent("drop", transfer)));
    expect(controller.addWorkspacePaths).not.toHaveBeenCalled();
    expect(container.querySelector("[role='status']")?.textContent).toContain("another workspace");
  });

  it("resolves Workbench resource URIs before requesting native workspace authorization", async () => {
    const controller = controllerFixture();
    const resource = "puppyone-local://workspace/folder-1/guanqun.md";
    const resolveWorkspaceReference: AgentWorkspaceReferenceResolver = vi.fn(() => ({
      workspaceRoot: "/workspace",
      referencePath: "guanqun.md",
    }));
    const container = render(<IngestionHarness
      controller={controller}
      resolveWorkspaceReference={resolveWorkspaceReference}
    />);
    const boundary = container.querySelector<HTMLElement>(".desktop-agent-boundary")!;

    await act(async () => boundary.dispatchEvent(dragEvent(
      "drop",
      typedWorkspaceTransfer("workspace-1", [resource]),
    )));

    await vi.waitFor(() => expect(controller.addWorkspacePaths).toHaveBeenCalledWith(["guanqun.md"]));
    expect(resolveWorkspaceReference).toHaveBeenCalledWith(resource);
    expect(controller.addWorkspacePaths).not.toHaveBeenCalledWith([resource]);
  });

  it("rejects a resource URI owned by another attached workspace root", async () => {
    const controller = controllerFixture();
    const resource = "puppyone-local://workspace/folder-2/secret.md";
    const resolveWorkspaceReference: AgentWorkspaceReferenceResolver = vi.fn(() => ({
      workspaceRoot: "/another-root",
      referencePath: "secret.md",
    }));
    const container = render(<IngestionHarness
      controller={controller}
      resolveWorkspaceReference={resolveWorkspaceReference}
    />);
    const boundary = container.querySelector<HTMLElement>(".desktop-agent-boundary")!;

    await act(async () => boundary.dispatchEvent(dragEvent(
      "drop",
      typedWorkspaceTransfer("workspace-1", [resource]),
    )));

    expect(controller.addWorkspacePaths).not.toHaveBeenCalled();
    expect(container.querySelector("[role='status']")?.textContent).toContain("another workspace");
  });

  it("routes Finder drop, picker and pasted image Files through the same staging method", async () => {
    const controller = controllerFixture();
    const container = render(<IngestionHarness controller={controller} withComposer />);
    const boundary = container.querySelector<HTMLElement>(".desktop-agent-boundary")!;
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const image = new File(["image"], "capture.png", { type: "image/png" });

    await act(async () => boundary.dispatchEvent(dragEvent("drop", fileTransfer([image]))));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [image] });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: fileTransfer([image]) });
    act(() => textarea.dispatchEvent(paste));

    await vi.waitFor(() => expect(controller.stageExternalFiles).toHaveBeenCalledTimes(3));
    expect(controller.stageExternalFiles.mock.calls.every(([files]) => files[0] === image)).toBe(true);
  });

  it("opens the file picker directly from plus and keeps status-aware retryable chips", () => {
    const onRetryReference = vi.fn();
    const onRemoveReference = vi.fn();
    const onAddExternalFiles = vi.fn();
    const container = render(<AgentComposer
      draft=""
      onDraftChange={vi.fn()}
      disabled={false}
      running={false}
      stopping={false}
      submitting={false}
      referenceCapabilities={capabilities()}
      references={[{
        id: "failed-ref",
        kind: "workspace-entry",
        entryType: "file",
        path: "missing.md",
        relativePath: "missing.md",
        displayName: "missing.md",
        status: "error",
        error: { code: "workspace-resolution-failed", message: "File no longer exists" },
      }]}
      onAddExternalFiles={onAddExternalFiles}
      onRetryReference={onRetryReference}
      onRemoveReference={onRemoveReference}
      onSubmit={vi.fn(async () => true)}
      onStop={vi.fn()}
    />);
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Add files from computer"]')!;
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const openFilePicker = vi.spyOn(fileInput, "click").mockImplementation(() => undefined);
    expect(trigger.className).toBe("desktop-agent-reference-trigger");
    expect(trigger.hasAttribute("aria-haspopup")).toBe(false);
    act(() => trigger.click());
    expect(openFilePicker).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="menu"]')).toBeNull();

    const retry = container.querySelector<HTMLButtonElement>('button[aria-label*="Retry reference"]')!;
    const failedChip = container.querySelector(".desktop-agent-reference-chips > .is-error");
    expect(failedChip?.getAttribute("title")).toContain("This workspace item could not be added");
    expect(failedChip?.getAttribute("title")).toContain("File no longer exists");
    expect(container.textContent).not.toContain("File no longer exists");
    expect(container.querySelector(".desktop-agent-reference-chip-copy small")).toBeNull();
    act(() => retry.click());
    expect(onRetryReference).toHaveBeenCalledWith("failed-ref");
    expect((container.querySelector('button[aria-label="Send message"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders staged images as compact tokens after the draft and before the toolbar", () => {
    const container = render(<AgentComposer
      draft="Describe this image"
      onDraftChange={vi.fn()}
      disabled={false}
      running={false}
      stopping={false}
      submitting={false}
      referenceCapabilities={capabilities()}
      references={[{
        id: "image-ref",
        kind: "staged-attachment",
        displayName: "capture.png",
        mime: "image/png",
        size: 5,
        status: "ready",
      }]}
      onRemoveReference={vi.fn()}
      onSubmit={vi.fn(async () => true)}
      onStop={vi.fn()}
    />);

    const composer = container.querySelector(".desktop-agent-composer")!;
    const preview = composer.querySelector(".desktop-agent-reference-chip-preview.is-image");
    const textarea = composer.querySelector("textarea")!;
    const toolbar = composer.querySelector(".desktop-agent-composer-trailing")!;
    expect(preview).not.toBeNull();
    expect(composer.querySelector(".desktop-agent-reference-chips")?.textContent).toContain("capture.png");
    expect(textarea.compareDocumentPosition(preview!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(preview?.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("announces partial batches while retaining the rejected item as an actionable error", async () => {
    const controller = controllerFixture();
    controller.stageExternalFiles.mockImplementationOnce(async () => {
      controller.getSnapshot.mockReturnValue({
        references: [{ id: "failed", status: "error", error: { message: "Unsupported type" } }],
      });
      return 0;
    });
    const container = render(<IngestionHarness controller={controller} />);
    const boundary = container.querySelector<HTMLElement>(".desktop-agent-boundary")!;
    await act(async () => boundary.dispatchEvent(dragEvent("drop", fileTransfer([
      new File(["pdf"], "paper.pdf", { type: "application/pdf" }),
    ]))));
    await vi.waitFor(() => expect(container.querySelector("[role='status']")?.textContent).toContain("1 could not be added"));
  });
});

function IngestionHarness({
  controller,
  withComposer = false,
  resolveWorkspaceReference,
}: {
  controller: ReturnType<typeof controllerFixture>;
  withComposer?: boolean;
  resolveWorkspaceReference?: AgentWorkspaceReferenceResolver;
}) {
  const ingestion = useAgentReferenceIngestion({
    controller: controller as never,
    workspaceId: "workspace-1",
    capabilities: capabilities(),
    resolveWorkspaceReference,
  });
  return <AgentPanelLayout
    ariaLabel="Agent Chat"
    conversation={<div>conversation</div>}
    dropActive={ingestion.dropActive}
    dropInvalid={ingestion.dropInvalid}
    dropLabel={ingestion.dropLabel}
    announcement={ingestion.announcement}
    onDragEnter={ingestion.onDragEnter}
    onDragOver={ingestion.onDragOver}
    onDragLeave={ingestion.onDragLeave}
    onDrop={ingestion.onDrop}
    dock={withComposer ? <AgentComposer
      draft=""
      onDraftChange={vi.fn()}
      disabled={false}
      running={false}
      stopping={false}
      submitting={false}
      referenceCapabilities={capabilities()}
      onAddExternalFiles={ingestion.addExternalFiles}
      onPickWorkspaceReferences={ingestion.pickWorkspaceReferences}
      onPaste={ingestion.onPaste}
      onSubmit={vi.fn(async () => true)}
      onStop={vi.fn()}
    /> : null}
  />;
}

function controllerFixture() {
  return {
    workspaceRoot: "/workspace",
    getSnapshot: vi.fn(() => ({ references: [] as Array<{ id: string; status: string; error?: { message: string } }> })),
    addWorkspacePaths: vi.fn(async (paths: string[]) => paths.length),
    addPathTextOrDraft: vi.fn(async () => false),
    stageExternalFiles: vi.fn(async (files: File[]) => files.length),
    pickWorkspaceReferences: vi.fn(async () => 1),
    submit: vi.fn(),
  };
}

function capabilities(): AgentReferenceInputCapabilities {
  return {
    workspaceFiles: true,
    workspaceDirectories: true,
    images: "local-snapshot",
    genericFiles: "none",
    acceptedMimeTypes: ["image/png"],
    maxReferences: 32,
    maxReferenceBytes: 25 * 1024 * 1024,
    maxTotalReferenceBytes: 25 * 1024 * 1024,
    steer: false,
    attachmentOnly: false,
  };
}

function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => renderWithTestLocalization(root, node));
  return container;
}

function typedWorkspaceTransfer(workspaceId: string, paths: string[]) {
  return fakeDataTransfer({
    [EXPLORER_REFERENCE_DRAG_TYPE]: JSON.stringify({
      version: 1,
      workspaceId,
      entries: paths.map((path, index) => ({
        path,
        name: path,
        entryType: index === paths.length - 1 && path === "src" ? "directory" : "file",
      })),
    }),
  });
}

function fileTransfer(files: File[]) {
  return fakeDataTransfer({}, files, ["Files"]);
}

function fakeDataTransfer(values: Record<string, string>, files: File[] = [], types = Object.keys(values)): DataTransfer {
  return {
    effectAllowed: "copy",
    dropEffect: "none",
    files: files as unknown as FileList,
    items: files.map(() => ({ kind: "file" })) as unknown as DataTransferItemList,
    types,
    getData: (type: string) => values[type] ?? "",
    setData: () => undefined,
    clearData: () => undefined,
    setDragImage: () => undefined,
  } as DataTransfer;
}

function dragEvent(type: string, dataTransfer: DataTransfer) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  return event;
}
