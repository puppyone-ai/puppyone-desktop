import { describe, expect, it } from "vitest";
import type { GitStatusSnapshot } from "../src/types/electron";
import {
  getGitHubRemoteFetchTarget,
  shouldFetchGitHubRemote,
} from "../src/features/source-control/githubRemoteRefreshPolicy";

describe("GitHub remote refresh policy", () => {
  it("targets only the effective GitHub remote for the current workspace", () => {
    const status = {
      isRepo: true,
      effectiveHosting: {
        kind: "github",
        remoteName: "origin",
        branchName: "main",
        ready: true,
      },
    } as GitStatusSnapshot;

    expect(getGitHubRemoteFetchTarget(status)).toEqual({
      remoteName: "origin",
      branchName: "main",
      key: "origin:main",
    });
    expect(getGitHubRemoteFetchTarget({
      ...status,
      effectiveHosting: { ...status.effectiveHosting, kind: "generic-git" },
    })).toBeNull();
  });

  it("fetches only while foreground and after the trigger-specific quiet period", () => {
    expect(shouldFetchGitHubRemote({
      focused: true,
      online: true,
      now: 100_000,
      lastAttemptAt: null,
      minimumGapMs: 15_000,
    })).toBe(true);
    expect(shouldFetchGitHubRemote({
      focused: true,
      online: true,
      now: 100_000,
      lastAttemptAt: 90_000,
      minimumGapMs: 15_000,
    })).toBe(false);
    expect(shouldFetchGitHubRemote({
      focused: false,
      online: true,
      now: 100_000,
      lastAttemptAt: null,
      minimumGapMs: 15_000,
    })).toBe(false);
    expect(shouldFetchGitHubRemote({
      focused: true,
      online: false,
      now: 100_000,
      lastAttemptAt: null,
      minimumGapMs: 15_000,
    })).toBe(false);
  });
});
