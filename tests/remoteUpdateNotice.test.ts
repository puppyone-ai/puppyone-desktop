import { describe, expect, it } from "vitest";
import { getRemoteUpdateNoticeModel } from "../src/features/data-workspace/RemoteUpdateNotice";
import type { GitStatusSnapshot } from "../src/types/electron";

function incomingStatus(overrides: Partial<GitStatusSnapshot["sourceControl"]["remote"]> = {}) {
  return {
    isRepo: true,
    effectiveHosting: {
      kind: "github",
      remoteName: "origin",
      branchName: "main",
      ref: "origin/main",
      ready: true,
    },
    branches: [{
      name: "origin/main",
      remote: true,
      lastCommitDate: "2026-08-27T01:30:00.000Z",
    }],
    sourceControl: {
      remote: {
        state: "incoming",
        behind: 3,
        canPull: true,
        target: { remote: "origin", ref: "origin/main" },
        incomingFileSummary: { total: 4 },
        incomingPreview: [
          { path: "docs/brief.md" },
          { path: "research/notes.md" },
          { path: "assets/chart.png" },
        ],
        ...overrides,
      },
    },
  } as GitStatusSnapshot;
}

describe("remote update notice model", () => {
  it("summarizes the remote source, changed files, commit count, and update time", () => {
    expect(getRemoteUpdateNoticeModel(incomingStatus())).toEqual({
      provider: "GitHub",
      providerKind: "github",
      behind: 3,
      fileCount: 4,
      fileNames: ["brief.md", "notes.md"],
      hiddenFileCount: 2,
      updatedAt: "2026-08-27T01:30:00.000Z",
      canPull: true,
      diverged: false,
    });
  });

  it("appears for divergence and stays hidden when there is nothing incoming", () => {
    expect(getRemoteUpdateNoticeModel(incomingStatus({ state: "diverged" }))?.diverged).toBe(true);
    expect(getRemoteUpdateNoticeModel(incomingStatus({ state: "synced", behind: 0 }))).toBeNull();
  });

  it("labels PuppyOne Cloud and generic remotes without special-casing the UI", () => {
    const cloud = incomingStatus();
    cloud.effectiveHosting.kind = "puppyone-cloud";
    expect(getRemoteUpdateNoticeModel(cloud)?.provider).toBe("PuppyOne Cloud");

    const generic = incomingStatus();
    generic.effectiveHosting.kind = "generic-git";
    generic.sourceControl.remote.target!.remote = "company";
    expect(getRemoteUpdateNoticeModel(generic)?.provider).toBe("company");
  });
});
