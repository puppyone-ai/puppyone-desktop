import { describe, expect, it, vi } from "vitest";
import { createEditorSurfaceResourceAdmission } from "../electron/main/editor-surfaces/resource-admission.mjs";

describe("Editor Surface resource admission", () => {
  it("authenticates and bounds a local capability before process creation", async () => {
    const inspectLocalCapability = vi.fn(() => ({
      rootPath: "/workspace",
      relativePath: "docs/report.pdf",
    }));
    const statWorkspaceFile = vi.fn(async () => ({ size: 20 }));
    const admit = createEditorSurfaceResourceAdmission({
      inspectLocalCapability,
      statWorkspaceFile,
      canonicalizeWorkspacePath: async (value) => value,
      isOpenWorkspaceRoot: () => true,
    });

    await expect(admit({
      resourceUrl: localUrl(),
      ownerWebContentsId: 7,
      resourcePolicy: { maxSourceBytes: 10 },
    })).rejects.toThrow("safe preview limit");
    expect(inspectLocalCapability).toHaveBeenCalledWith(expect.objectContaining({
      senderId: 7,
      purpose: "file-preview",
      requestPath: "report.pdf",
    }));
    expect(statWorkspaceFile).toHaveBeenCalledWith("/workspace", "docs/report.pdf");
  });

  it("fails closed when the local capability belongs to another owner", async () => {
    const admit = createEditorSurfaceResourceAdmission({
      inspectLocalCapability: () => null,
      statWorkspaceFile: vi.fn(),
      canonicalizeWorkspacePath: async (value) => value,
      isOpenWorkspaceRoot: () => true,
    });
    await expect(admit({
      resourceUrl: localUrl(),
      ownerWebContentsId: 8,
      resourcePolicy: { maxSourceBytes: 10 },
    })).rejects.toThrow("not authorized");
  });

  it("admits HTTPS as unknown length for bounded streaming in the leaf", async () => {
    const admit = createEditorSurfaceResourceAdmission({
      inspectLocalCapability: vi.fn(),
      statWorkspaceFile: vi.fn(),
      canonicalizeWorkspacePath: vi.fn(),
      isOpenWorkspaceRoot: vi.fn(),
    });
    await expect(admit({
      resourceUrl: "https://example.com/report.pdf",
      ownerWebContentsId: 7,
      resourcePolicy: { maxSourceBytes: 10 },
    })).resolves.toEqual({ byteLength: null });
  });
});

function localUrl() {
  return `puppyone-local://file/${"a".repeat(43)}/file-preview/report.pdf`;
}
