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
import { useAgentReferenceIngestion } from "../src/features/desktop-agent/ui/useAgentReferenceIngestion";
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

  it("provides a keyboard-accessible stable plus menu and status-aware retryable chips", async () => {
    const onRetryReference = vi.fn();
    const onRemoveReference = vi.fn();
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
        error: { code: "missing", message: "File no longer exists" },
      }]}
      onRetryReference={onRetryReference}
      onRemoveReference={onRemoveReference}
      onSubmit={vi.fn(async () => true)}
      onStop={vi.fn()}
    />);
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Add context"]')!;
    expect(trigger.className).toBe("desktop-agent-reference-trigger");
    act(() => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull());
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
    expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.activeElement).toBe(trigger);

    const retry = container.querySelector<HTMLButtonElement>('button[aria-label*="Retry reference"]')!;
    expect(container.textContent).toContain("File no longer exists");
    act(() => retry.click());
    expect(onRetryReference).toHaveBeenCalledWith("failed-ref");
    expect((container.querySelector('button[aria-label="Send message"]') as HTMLButtonElement).disabled).toBe(true);
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

function IngestionHarness({ controller, withComposer = false }: { controller: ReturnType<typeof controllerFixture>; withComposer?: boolean }) {
  const ingestion = useAgentReferenceIngestion({
    controller: controller as never,
    workspaceId: "workspace-1",
    capabilities: capabilities(),
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
