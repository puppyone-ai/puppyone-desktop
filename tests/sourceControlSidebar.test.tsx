/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitSidebar } from "../src/features/source-control/SourceControlSidebar";
import type { GitSourceControlResource, GitStatusSnapshot } from "../src/types/electron";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  document.body.innerHTML = "";
});

describe("Git sidebar status groups", () => {
  it("renders local groups expanded and flat while keeping their counts and actions in the headers", async () => {
    const onCommit = vi.fn(async () => true);
    const onPush = vi.fn(async () => true);
    const onStageAll = vi.fn(async () => true);
    const onDiscardAll = vi.fn(async () => true);
    const surface = renderSidebar({ onCommit, onDiscardAll, onPush, onStageAll });

    expect(surface.querySelector(".desktop-git-status-card")).toBeNull();
    expect(surface.querySelectorAll(".desktop-git-local-section-body.expanded")).toHaveLength(3);
    expect(surface.textContent).toContain("Committed Changes");
    const localCounts = Array.from(surface.querySelectorAll(".desktop-git-section-title small"))
      .map((node) => node.textContent);
    expect(localCounts).toEqual(expect.arrayContaining(["2", "1", "1"]));

    const commitButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Commit"]');
    const pushButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Push"]');
    const stageAllButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Stage all"]');
    const discardAllButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Discard all"]');

    for (const button of [commitButton, pushButton, stageAllButton, discardAllButton]) {
      expect(button?.closest(".desktop-git-section-row")).not.toBeNull();
      expect(button?.closest(".desktop-git-status-card")).toBeNull();
    }

    await act(async () => {
      commitButton?.click();
      pushButton?.click();
      stageAllButton?.click();
      discardAllButton?.click();
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onPush).toHaveBeenCalledTimes(1);
    expect(onStageAll).toHaveBeenCalledTimes(1);
    expect(onDiscardAll).toHaveBeenCalledTimes(1);
  });

  it("keeps every local group on the same collapsible flat-section contract", () => {
    const surface = renderSidebar();
    const committedSection = surface.querySelector<HTMLElement>(".desktop-git-resizable-section-committed");
    const stagedSection = surface.querySelector<HTMLElement>(".desktop-git-resizable-section-staged");
    const committedToggle = Array.from(surface.querySelectorAll<HTMLButtonElement>(".desktop-git-section-title"))
      .find((button) => button.textContent?.includes("Committed Changes"));
    const stagedToggle = Array.from(surface.querySelectorAll<HTMLButtonElement>(".desktop-git-section-title"))
      .find((button) => button.textContent?.includes("Staged Changes"));

    expect(committedSection?.classList.contains("expanded")).toBe(true);
    expect(committedSection?.querySelector(".desktop-git-status-card")).toBeNull();
    expect(committedSection?.querySelector(".desktop-git-local-section-body")?.classList.contains("expanded"))
      .toBe(true);
    expect(committedToggle?.querySelector("small")?.textContent).toBe("2");
    expect(committedToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(stagedToggle?.getAttribute("aria-expanded")).toBe("true");

    act(() => stagedToggle?.click());

    expect(committedSection?.classList.contains("expanded")).toBe(true);
    expect(committedToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(stagedSection?.classList.contains("collapsed")).toBe(true);
    expect(stagedToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(surface.querySelector(".desktop-git-resizable-section-unstaged")?.classList.contains("expanded")).toBe(true);
  });

  it("keeps simple mode as one combined flat local-change group with one primary action", async () => {
    const stageAndCommit = vi.fn(async () => true);
    const surface = renderSidebar({ gitDisplayMode: "simple", stageAndCommit });

    expect(surface.textContent).not.toContain("Staged Changes");
    expect(surface.textContent).toContain("Unstaged Changes");
    const unstagedToggle = Array.from(surface.querySelectorAll<HTMLButtonElement>(".desktop-git-section-title"))
      .find((button) => button.textContent?.includes("Unstaged Changes"));
    expect(unstagedToggle?.querySelector("small")?.textContent).toBe("2");
    const action = surface.querySelector<HTMLButtonElement>('button[aria-label="Stage & Commit"]');
    expect(action?.closest(".desktop-git-resizable-section-unstaged")).not.toBeNull();

    await act(async () => action?.click());
    expect(stageAndCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps the provider layout preference separate from the flat local groups", () => {
    const surface = renderSidebar({
      gitSidebarLayout: "dividers",
      status: createDivergedGitHubStatus(),
    });
    const githubSection = surface.querySelector<HTMLElement>(".desktop-git-github-provider-section");
    const githubCard = githubSection?.querySelector<HTMLElement>(".desktop-git-github-change-card");
    const committedSection = surface.querySelector<HTMLElement>(".desktop-git-resizable-section-committed");

    expect(githubSection?.classList.contains("is-divider-layout")).toBe(true);
    expect(githubSection?.querySelector(".desktop-git-card-divider .desktop-git-github-identity")).not.toBeNull();
    expect(githubCard?.querySelector(".desktop-git-github-identity")).toBeNull();
    expect(githubCard?.querySelector('button[aria-label="Pull"]')).not.toBeNull();
    const committedToggle = committedSection?.querySelector<HTMLButtonElement>(
      ".desktop-git-section-row .desktop-git-section-title",
    );
    expect(committedToggle?.querySelector("span")?.textContent).toBe("Committed Changes");
    expect(committedToggle?.querySelector(".po-disclosure-icon")).not.toBeNull();
    expect(committedToggle?.querySelectorAll("svg")).toHaveLength(1);
    expect(committedToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(committedToggle?.querySelector("small")?.textContent).toBe("1");
    expect(committedSection?.querySelector(".desktop-git-status-card")).toBeNull();
    expect(committedSection?.querySelector('.desktop-git-section-row button[aria-label="Push"]')).not.toBeNull();

    act(() => committedToggle?.click());

    expect(committedToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(committedSection?.classList.contains("collapsed")).toBe(true);
  });

  it("renders merge conflicts through the same default-expanded flat contract", () => {
    const status = createGitStatus();
    status.sourceControl.groups.unshift({
      id: "merge",
      label: "Merge Changes",
      resources: [resource("merge", "conflicted.md", "conflict", "!")],
    });
    status.sourceControl.actions.canCommit = false;
    const surface = renderSidebar({ status });
    const mergeSection = surface.querySelector<HTMLElement>(".desktop-git-resizable-section-merge");

    expect(mergeSection?.textContent).toContain("Merge Changes");
    expect(mergeSection?.querySelector(".desktop-git-section-title small")?.textContent).toBe("1");
    expect(mergeSection?.querySelector(".desktop-git-status-card")).toBeNull();
    expect(mergeSection?.querySelector(".desktop-git-local-section-body")?.classList.contains("expanded")).toBe(true);
  });

  it("recommends Pull and blocks Push while the GitHub branch is diverged", async () => {
    const onPull = vi.fn(async () => true);
    const onPush = vi.fn(async () => true);
    const status = createDivergedGitHubStatus();
    const surface = renderSidebar({ onPull, onPush, status });
    const pullButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Pull"]');
    const pushButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Push"]');

    expect(pullButton?.disabled).toBe(false);
    expect(pullButton?.classList.contains("is-primary")).toBe(true);
    expect(pushButton?.disabled).toBe(true);
    expect(pushButton?.classList.contains("is-primary")).toBe(false);

    await act(async () => {
      pullButton?.click();
      pushButton?.click();
    });

    expect(onPull).toHaveBeenCalledTimes(1);
    expect(onPush).not.toHaveBeenCalled();
  });

  it("keeps Pull primary when incoming commits and staged files exist together", () => {
    const status = createDivergedGitHubStatus();
    status.sourceControl.groups = [{
      id: "index",
      label: "Staged Changes",
      resources: [resource("index", "staged.md", "modified", "M")],
    }];
    status.sourceControl.actions.canCommit = true;
    const surface = renderSidebar({ status });
    const pullButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Pull"]');
    const commitButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Commit"]');

    expect(pullButton?.classList.contains("is-primary")).toBe(true);
    expect(commitButton?.disabled).toBe(false);
    expect(commitButton?.classList.contains("is-primary")).toBe(false);
  });

  it("blocks sync actions until working-tree conflicts are resolved", async () => {
    const onPush = vi.fn(async () => true);
    const status = createGitStatus();
    status.sourceControl.groups.unshift({
      id: "merge",
      label: "Merge Changes",
      resources: [resource("merge", "conflicted.md", "conflict", "!")],
    });
    status.sourceControl.actions.canCommit = false;
    const surface = renderSidebar({ onPush, status });
    const pushButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Push"]');

    expect(pushButton?.disabled).toBe(true);
    expect(pushButton?.classList.contains("is-primary")).toBe(false);
    await act(async () => pushButton?.click());
    expect(onPush).not.toHaveBeenCalled();
  });

  it("makes Continue the only primary action after rebase conflicts are staged", async () => {
    const onContinue = vi.fn(async () => true);
    const onPush = vi.fn(async () => true);
    const status = createGitStatus();
    status.sourceControl.operation = { kind: "rebase", canContinue: true, canAbort: true };
    status.sourceControl.actions.canCommit = false;
    const surface = renderSidebar({ onContinue, onPush, status });
    const continueButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Continue"]');
    const abortButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Abort"]');
    const pushButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Push"]');

    expect(surface.textContent).toContain("Git Operation");
    expect(continueButton?.disabled).toBe(false);
    expect(continueButton?.classList.contains("is-primary")).toBe(true);
    expect(abortButton?.disabled).toBe(false);
    expect(pushButton?.disabled).toBe(true);
    expect(pushButton?.classList.contains("is-primary")).toBe(false);

    await act(async () => continueButton?.click());
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onPush).not.toHaveBeenCalled();
  });
});

function renderSidebar(options: Partial<{
  gitDisplayMode: "simple" | "professional";
  gitSidebarLayout: "cards" | "dividers";
  onCommit: () => Promise<boolean>;
  onContinue: () => Promise<boolean>;
  onDiscardAll: () => Promise<boolean>;
  onPull: () => Promise<boolean>;
  onPush: () => Promise<boolean>;
  onStageAll: () => Promise<boolean>;
  stageAndCommit: () => Promise<boolean>;
  status: GitStatusSnapshot;
}> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const succeed = async () => true;

  act(() => root.render(withTestLocalization(
    <GitSidebar
      repository={{
        status: options.status ?? createGitStatus(),
        puppyoneConfig: null,
        gitDisplayMode: options.gitDisplayMode ?? "professional",
        gitSidebarLayout: options.gitSidebarLayout ?? "cards",
        fileIconTheme: "default",
      }}
      view={{
        activePanel: "changes",
        selectedWorkingFile: null,
        operationLoading: null,
        operationError: null,
        loading: false,
        error: null,
      }}
      actions={{
        selectPanel: vi.fn(),
        selectWorkingFile: vi.fn(),
        stagePaths: succeed,
        stageAll: options.onStageAll ?? succeed,
        unstagePaths: succeed,
        discardPaths: succeed,
        discardAll: options.onDiscardAll ?? succeed,
        stageAndCommit: options.stageAndCommit ?? succeed,
        commit: options.onCommit ?? succeed,
        commitAndPush: succeed,
        continueOperation: options.onContinue ?? succeed,
        abortOperation: succeed,
        pull: options.onPull ?? succeed,
        push: options.onPush ?? succeed,
        publish: succeed,
      }}
      cloudBackup={{ loading: false, error: null, enabled: false, start: vi.fn() }}
    />,
  )));
  return container;
}

function createGitStatus(): GitStatusSnapshot {
  const staged = resource("index", "staged.md", "added", "A");
  const unstaged = resource("workingTree", "working.md", "modified", "M");
  const committed = resource("workingTree", "committed.md", "modified", "M");
  const target = {
    remote: "origin",
    branch: "main",
    ref: "origin/main",
    exists: true,
    ahead: 2,
    behind: 0,
    incomingPreview: [],
    outgoingPreview: [committed],
  } as const;

  return {
    isRepo: true,
    branch: "main",
    headCommitId: "head",
    totalCommits: 8,
    entries: [],
    stagedEntries: [],
    unstagedEntries: [],
    untrackedEntries: [],
    branches: [{
      name: "main",
      current: true,
      remote: false,
      upstream: "origin/main",
      ahead: 2,
      behind: 0,
      lastCommitId: "head",
      lastCommitMessage: "Test commit",
      lastCommitDate: "2026-08-22T08:00:00.000Z",
    }],
    remotes: [{ name: "origin", fetchUrl: "https://example.com/repo.git", pushUrl: "https://example.com/repo.git", branches: ["main"] }],
    syncTarget: target,
    effectiveHosting: {
      kind: "generic-git",
      remoteName: "origin",
      branchName: "main",
      ref: "origin/main",
      ready: true,
      reason: "remote-detected",
      identity: null,
    },
    sourceControl: {
      input: { placeholder: "", defaultMessage: "" },
      groups: [
        { id: "index", label: "Staged Changes", resources: [staged] },
        { id: "workingTree", label: "Changes", resources: [unstaged] },
      ],
      remote: {
        target,
        currentBranch: "main",
        upstream: "origin/main",
        ahead: 2,
        behind: 0,
        incomingPreview: [],
        outgoingPreview: [committed],
        canPull: false,
        canPush: true,
        canSync: true,
        canPublish: false,
        state: "outgoing",
      },
      actions: {
        canStageAll: true,
        canUnstageAll: true,
        canDiscardAll: true,
        canCommit: true,
      },
    },
    commits: [],
    allCommits: [],
    statusLimit: 10_000,
    didHitStatusLimit: false,
  };
}

function createDivergedGitHubStatus(): GitStatusSnapshot {
  const status = createGitStatus();
  const incoming = resource("workingTree", "remote.md", "added", "A");
  const outgoing = resource("workingTree", "committed.md", "modified", "M");
  const target = {
    remote: "origin",
    branch: "main",
    ref: "origin/main",
    exists: true,
    ahead: 1,
    behind: 1,
    incomingPreview: [incoming],
    outgoingPreview: [outgoing],
  } as const;

  status.syncTarget = target;
  status.effectiveHosting = {
    kind: "github",
    remoteName: "origin",
    branchName: "main",
    ref: "origin/main",
    ready: true,
    reason: "remote-detected",
    identity: {
      provider: "github",
      label: "puppyone-ai/X-influencer",
      href: "https://github.com/puppyone-ai/X-influencer",
    },
  };
  status.branches = [
    {
      ...status.branches[0],
      ahead: 1,
      behind: 1,
    },
    {
      name: "origin/main",
      current: false,
      remote: true,
      upstream: null,
      ahead: 0,
      behind: 0,
      lastCommitId: "remote-head",
      lastCommitMessage: "Remote update",
      lastCommitDate: "2026-08-20T08:00:00.000Z",
    },
  ];
  status.sourceControl.groups = [];
  status.sourceControl.remote = {
    ...status.sourceControl.remote,
    target,
    ahead: 1,
    behind: 1,
    incomingFileSummary: {
      total: 1,
      added: 1,
      modified: 0,
      deleted: 0,
      renamed: 0,
      copied: 0,
      changed: 0,
    },
    incomingPreview: [incoming],
    outgoingPreview: [outgoing],
    canPull: true,
    canPush: true,
    canSync: true,
    canPublish: false,
    state: "diverged",
  };
  return status;
}

function resource(
  group: GitSourceControlResource["group"],
  path: string,
  status: GitSourceControlResource["status"],
  letter: string,
): GitSourceControlResource {
  return {
    id: `${group}:${path}`,
    group,
    path,
    oldPath: null,
    status,
    staged: group === "index",
    conflict: false,
    letter,
  };
}
