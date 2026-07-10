import { describe, expect, it } from "vitest";
import type { GitCommitSummary, GitStatusSnapshot } from "../src/types/electron";
import {
  mergePreservedHistory,
  shouldInvalidateHistoryForReason,
} from "../src/features/source-control/useDesktopGitController";

const sampleCommit: GitCommitSummary = {
  commit_id: "abc",
  parent_ids: [],
  author_name: "Test",
  author_email: "test@puppyone.test",
  created_at: null,
  message: "one",
  changes: [],
};

function snapshot(partial: Partial<GitStatusSnapshot> = {}): GitStatusSnapshot {
  return {
    isRepo: true,
    branch: "main",
    headCommitId: "abc",
    totalCommits: 1,
    entries: [],
    stagedEntries: [],
    unstagedEntries: [],
    untrackedEntries: [],
    branches: [],
    remotes: [],
    syncTarget: null,
    effectiveHosting: {
      kind: "local-only",
      remoteName: null,
      branchName: "main",
      ref: null,
      ready: false,
      reason: "local-only",
      identity: null,
    },
    sourceControl: {
      input: { placeholder: "", defaultMessage: "" },
      groups: [],
      remote: {
        target: null,
        currentBranch: "main",
        upstream: null,
        ahead: 0,
        behind: 0,
        incomingPreview: [],
        outgoingPreview: [],
        canPull: false,
        canPush: false,
        canSync: false,
        canPublish: false,
        state: "no-remote",
      },
      actions: {
        canStageAll: false,
        canUnstageAll: false,
        canDiscardAll: false,
        canCommit: false,
      },
    },
    commits: [],
    allCommits: [],
    ...partial,
  };
}

describe("history invalidation policy", () => {
  it("invalidates cached history for ref/fetch/merge/config metadata reasons", () => {
    expect(shouldInvalidateHistoryForReason("ref")).toBe(true);
    expect(shouldInvalidateHistoryForReason("fetch")).toBe(true);
    expect(shouldInvalidateHistoryForReason("merge")).toBe(true);
    expect(shouldInvalidateHistoryForReason("config")).toBe(true);
    expect(shouldInvalidateHistoryForReason("git-metadata")).toBe(true);
    expect(shouldInvalidateHistoryForReason("watcher-recovered")).toBe(true);
  });

  it("preserves history across working-tree and index-only refreshes", () => {
    expect(shouldInvalidateHistoryForReason("working-tree")).toBe(false);
    expect(shouldInvalidateHistoryForReason("index")).toBe(false);
    expect(shouldInvalidateHistoryForReason("manual")).toBe(false);
    expect(shouldInvalidateHistoryForReason("configuration")).toBe(false);
  });

  it("clears commits when invalidateHistory is requested even if HEAD is unchanged", () => {
    const previous = snapshot({
      commits: [sampleCommit],
      allCommits: [sampleCommit],
    });
    const next = snapshot({ commits: [], allCommits: [] });
    const merged = mergePreservedHistory(previous, next, { invalidateHistory: true });
    expect(merged.commits).toEqual([]);
    expect(merged.allCommits).toEqual([]);
  });

  it("keeps commits when HEAD is unchanged and history is not invalidated", () => {
    const previous = snapshot({
      commits: [sampleCommit],
      allCommits: [sampleCommit],
    });
    const next = snapshot({ commits: [], allCommits: [] });
    const merged = mergePreservedHistory(previous, next);
    expect(merged.commits).toHaveLength(1);
    expect(merged.allCommits).toHaveLength(1);
  });
});
