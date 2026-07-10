import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gitStatusView = read("../src/features/source-control/GitStatusView.tsx");
const registry = read("../src/features/source-control/diff/registry.tsx");
const docxView = read("../src/features/source-control/diff/DocxRedlineDiff.tsx");
const provider = read("../src/features/source-control/diff/docx/docxRedlineProvider.ts");
const task = read("../src/features/source-control/diff/docx/docxRedlineTask.ts");
const ipc = read("../electron/main/ipc/workspace-git-ipc.mjs");

describe("format-aware diff architecture", () => {
  it("keeps format decisions in the ordered registry rather than GitStatusView", () => {
    expect(gitStatusView).toContain("<FormatAwareDiff");
    expect(gitStatusView).not.toMatch(/\.docx|format\.id|file\.binary\s*\?/);
    expect(registry.indexOf('id: "docx-redline"')).toBeLessThan(registry.indexOf('id: "text-unified"'));
    expect(registry.indexOf('id: "text-unified"')).toBeLessThan(registry.indexOf('id: "binary-summary"'));
    expect(registry).toContain("resolveFileFormat");
  });

  it("keeps heavy DOCX parsing behind dynamic provider and worker boundaries", () => {
    expect(docxView).toContain('import("./docx/docxRedlineProvider")');
    expect(docxView).not.toContain("jszip");
    expect(registry).not.toContain("docxRedlineTask");
    expect(provider).toContain("buildDocxRedlineInWorker");
    expect(task).toContain("validateOfficePackageDecompression");
    expect(task).toContain('await import("jszip")');
  });

  it("keeps resource authority and cancellation in trusted IPC", () => {
    expect(ipc).toContain('"workspace:git-file-diff-cancel"');
    expect(ipc).toContain('"workspace:git-diff-resource-read"');
    expect(ipc).toContain("ownerWebContentsId: event.sender.id");
    expect(ipc).toContain("controller.signal");
  });
});

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
