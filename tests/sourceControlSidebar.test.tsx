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

describe("Git sidebar status cards", () => {
  it("renders local cards expanded with their contextual counts and actions inside the cards", async () => {
    const onCommit = vi.fn(async () => true);
    const onPush = vi.fn(async () => true);
    const onStageAll = vi.fn(async () => true);
    const onDiscardAll = vi.fn(async () => true);
    const surface = renderSidebar({ onCommit, onDiscardAll, onPush, onStageAll });

    const cards = Array.from(surface.querySelectorAll<HTMLElement>(".desktop-git-status-card"));
    expect(cards).toHaveLength(3);
    expect(cards.every((card) => card.classList.contains("expanded"))).toBe(true);
    expect(surface.textContent).toContain("2 commits");
    expect(surface.textContent?.match(/1 file/g)).toHaveLength(2);

    const commitButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Commit"]');
    const pushButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Push"]');
    const stageAllButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Stage all"]');
    const discardAllButton = surface.querySelector<HTMLButtonElement>('button[aria-label="Discard all"]');

    for (const button of [commitButton, pushButton, stageAllButton, discardAllButton]) {
      expect(button?.closest(".desktop-git-status-card")).not.toBeNull();
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

  it("keeps each card independently collapsible after the default-expanded render", () => {
    const surface = renderSidebar();
    const committedSection = surface.querySelector<HTMLElement>(".desktop-git-resizable-section-committed");
    const committedToggle = Array.from(surface.querySelectorAll<HTMLButtonElement>(".desktop-git-section-title"))
      .find((button) => button.textContent?.includes("Committed Changes"));

    expect(committedSection?.classList.contains("expanded")).toBe(true);
    const committedCard = committedSection?.querySelector<HTMLElement>(".desktop-git-status-card");
    expect(committedCard?.classList.contains("expanded")).toBe(true);
    expect(committedToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(committedToggle?.getAttribute("aria-controls")).toBe(committedCard?.id);
    expect(committedCard?.hasAttribute("inert")).toBe(false);

    act(() => committedToggle?.click());

    expect(committedSection?.classList.contains("collapsed")).toBe(true);
    expect(committedCard?.classList.contains("collapsed")).toBe(true);
    expect(committedToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(committedCard?.getAttribute("aria-hidden")).toBe("true");
    expect(committedCard?.hasAttribute("inert")).toBe(true);
    expect(surface.querySelector(".desktop-git-resizable-section-staged")?.classList.contains("expanded")).toBe(true);
    expect(surface.querySelector(".desktop-git-resizable-section-unstaged")?.classList.contains("expanded")).toBe(true);
  });

  it("keeps simple mode as one combined local-change card with one primary action", async () => {
    const stageAndCommit = vi.fn(async () => true);
    const surface = renderSidebar({ gitDisplayMode: "simple", stageAndCommit });

    expect(surface.textContent).not.toContain("Staged Changes");
    expect(surface.textContent).toContain("Unstaged Changes");
    expect(surface.textContent).toContain("2 files");
    const action = surface.querySelector<HTMLButtonElement>('button[aria-label="Stage & Commit"]');
    expect(action?.closest(".desktop-git-resizable-section-unstaged")).not.toBeNull();

    await act(async () => action?.click());
    expect(stageAndCommit).toHaveBeenCalledTimes(1);
  });

  it("renders merge conflicts through the same default-expanded card contract", () => {
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
    expect(mergeSection?.textContent).toContain("1 conflict");
    expect(mergeSection?.querySelector(".desktop-git-status-card")?.classList.contains("expanded")).toBe(true);
  });
});

function renderSidebar(options: Partial<{
  gitDisplayMode: "simple" | "professional";
  onCommit: () => Promise<boolean>;
  onDiscardAll: () => Promise<boolean>;
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
        pull: succeed,
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
