/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitFileDiff, GitStatusSnapshot } from "../src/types/electron";
import { GitFileDiffSurface } from "../src/features/source-control/diff/GitFileDiffSurface";
import { getGitDiffContextPresentation } from "../src/features/source-control/diff/presentation";
import { WorkingFileDetail } from "../src/features/source-control/WorkingFileDetail";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  document.body.innerHTML = "";
});

describe("local Git diff presentation", () => {
  it("uses the exact same file surface in focused Changes and embedded History contexts", () => {
    const file = textFile();
    const focused = render(
      <WorkingFileDetail
        selection={{ path: file.path, status: "added", staged: false, origin: "committed" }}
        status={statusWithRemote({ ahead: 11, behind: 0 })}
        detail={{ commit_id: "local-commits", files: [file] }}
        loading={false}
        error={null}
        operationLoading={null}
        operationError={null}
        onStagePaths={async () => true}
        onUnstagePaths={async () => true}
        onDiscardPaths={async () => true}
        onOpenFile={vi.fn()}
      />,
    );
    const embedded = render(<GitFileDiffSurface file={file} />);

    expect(focused.querySelector(".desktop-file-diff")?.outerHTML)
      .toBe(embedded.querySelector(".desktop-file-diff")?.outerHTML);
    expect(focused.querySelector(".desktop-working-diff-context-label")?.textContent).toBe("OUTGOING");
    expect(focused.querySelector(".desktop-change-badge")?.textContent).toBe("Added");
    expect(focused.textContent).toContain("11 local commits");
    expect(focused.textContent).toContain("origin/main");
    expect(focused.querySelector(".without-header")).toBeNull();
  });

  it("keeps comparison scope separate from the file change kind", () => {
    expect(getGitDiffContextPresentation(
      { path: "notes.md", status: "modified", staged: false, origin: "remote" },
      statusWithRemote({ ahead: 0, behind: 2 }),
    )).toEqual({
      label: "INCOMING",
      detail: "Net changes in 2 remote commits from origin/main.",
      tone: "incoming",
    });
    expect(getGitDiffContextPresentation(
      { path: "notes.md", status: "modified", staged: true, origin: "local" },
      null,
    ).detail).toBe("HEAD → index");
    expect(getGitDiffContextPresentation(
      { path: "new.md", status: "untracked", staged: false, origin: "local" },
      null,
    ).detail).toBe("Not present → working tree");
  });
});

function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(node));
  return container;
}

function textFile(): GitFileDiff {
  return {
    path: "dev issues/3-done/ISSUE-030.md",
    oldPath: null,
    status: "added",
    additions: 2,
    deletions: 0,
    binary: false,
    lines: [
      { kind: "hunk", text: "@@ -0,0 +1,2 @@" },
      { kind: "add", text: "# ISSUE-030", newLine: 1 },
      { kind: "add", text: "Done", newLine: 2 },
    ],
  };
}

function statusWithRemote({ ahead, behind }: { ahead: number; behind: number }) {
  return {
    sourceControl: {
      remote: {
        ahead,
        behind,
        upstream: "origin/main",
        target: { ref: "origin/main" },
      },
    },
  } as GitStatusSnapshot;
}
