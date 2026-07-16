/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopCloudSession } from "../src/lib/cloudApi";
import type { GitRepositoryContext } from "../src/features/source-control/gitRefreshScheduler";
import type { GitStatusSnapshot } from "../src/types/electron";

const localFiles = vi.hoisted(() => ({
  commitWorkspaceGit: vi.fn(),
  getWorkspaceGitStatus: vi.fn(),
  initializeWorkspaceGitRepository: vi.fn(),
  pushWorkspaceGitCommitToRemote: vi.fn(),
  stageAllWorkspaceGitChanges: vi.fn(),
}));

const cloudApi = vi.hoisted(() => ({
  createCloudProject: vi.fn(),
}));

const cloudSession = vi.hoisted(() => ({
  authErrorListener: null as ((message: string) => void) | null,
  onDesktopCloudAuthError: vi.fn((listener: (message: string) => void) => {
    cloudSession.authErrorListener = listener;
    return () => {
      if (cloudSession.authErrorListener === listener) cloudSession.authErrorListener = null;
    };
  }),
}));

vi.mock("../src/lib/localFiles", () => localFiles);
vi.mock("../src/lib/cloudApi", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/cloudApi")>("../src/lib/cloudApi");
  return { ...actual, createCloudProject: cloudApi.createCloudProject };
});
vi.mock("../src/lib/cloudSession", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/cloudSession")>("../src/lib/cloudSession");
  return { ...actual, onDesktopCloudAuthError: cloudSession.onDesktopCloudAuthError };
});

import { usePuppyoneCloudBackup } from "../src/features/cloud/workspace/usePuppyoneCloudBackup";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const session = {
  user_id: "user-1",
  user_email: "dev@example.com",
  api_base_url: "https://cloud.example/api/v1",
  session_generation: "generation-1",
  status: "authenticated",
  expires_at: 4_102_444_800,
  expires_in: 3_600,
} as DesktopCloudSession;

const initialStatus = {
  isRepo: true,
  branch: "main",
  totalCommits: 1,
  entries: [],
  branches: [],
  stagedEntries: [],
  unstagedEntries: [],
  untrackedEntries: [],
  remotes: [],
  headCommitId: "head-before-publish",
} as unknown as GitStatusSnapshot;

const publishedStatus = {
  ...initialStatus,
  remotes: [{
    name: "puppyone",
    fetchUrl: "https://cloud.example/git/project-1.git",
    pushUrl: "https://cloud.example/git/project-1.git",
    branches: [],
  }],
  headCommitId: "head-before-publish",
} as GitStatusSnapshot;

const repositoryContext = {
  rootPath: "/tmp/local-notes",
} as GitRepositoryContext;

const actions = {
  applyGitStatus: vi.fn(() => true),
  captureGitRepositoryContext: vi.fn(() => repositoryContext),
  clearGitSelection: vi.fn(),
  handleCloudSessionChange: vi.fn(),
  isGitRepositoryContextCurrent: vi.fn(() => true),
  onConfigureCloudRemote: vi.fn(async () => publishedStatus),
  refreshWorkspaceContent: vi.fn(),
  setActiveCloudSection: vi.fn(),
  setActiveView: vi.fn(),
  setGitOperationError: vi.fn(),
  setGitOperationLoading: vi.fn(),
  setSidebarCollapsed: vi.fn(),
  setSwitcherOpen: vi.fn(),
};

function PublishHarness({
  activeSession,
  activeStatus = initialStatus,
  startCloudBrowserSignIn,
}: {
  activeSession: DesktopCloudSession | null;
  activeStatus?: GitStatusSnapshot;
  startCloudBrowserSignIn: () => Promise<boolean>;
}) {
  const publish = usePuppyoneCloudBackup({
    activeCloudSession: activeSession,
    activeGitStatus: activeStatus,
    applyGitStatus: actions.applyGitStatus,
    captureGitRepositoryContext: actions.captureGitRepositoryContext,
    clearGitSelection: actions.clearGitSelection,
    cloudEnabled: true,
    handleCloudSessionChange: actions.handleCloudSessionChange,
    onConfigureCloudRemote: actions.onConfigureCloudRemote,
    isGitRepositoryContextCurrent: actions.isGitRepositoryContextCurrent,
    refreshWorkspaceContent: actions.refreshWorkspaceContent,
    setActiveCloudSection: actions.setActiveCloudSection,
    setActiveView: actions.setActiveView,
    setGitOperationError: actions.setGitOperationError,
    setGitOperationLoading: actions.setGitOperationLoading,
    setSidebarCollapsed: actions.setSidebarCollapsed,
    setSwitcherOpen: actions.setSwitcherOpen,
    startCloudBrowserSignIn,
    workspace: {
      id: "local-notes",
      name: "Local Notes",
      path: repositoryContext.rootPath,
    },
    workspaceIsCloud: false,
  });

  return (
    <>
      <button type="button" onClick={publish.handleStartPuppyoneBackup}>Publish</button>
      <output
        data-pending={String(publish.pendingCloudBackupSetup)}
        data-loading={String(publish.cloudBackupLoading)}
        data-error={publish.cloudBackupError?.code ?? ""}
        data-error-detail={publish.cloudBackupError?.detail ?? ""}
        data-continuation-project={publish.cloudBackupContinuation?.projectId ?? ""}
        data-continuation-phase={publish.cloudBackupContinuation?.phase ?? ""}
        data-can-retry={String(publish.cloudBackupCanRetry)}
      />
    </>
  );
}

describe("explicit PuppyOne Cloud publish flow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    cloudSession.authErrorListener = null;
    cloudApi.createCloudProject.mockResolvedValue({ id: "project-1", name: "Local Notes" });
    localFiles.getWorkspaceGitStatus.mockResolvedValue(initialStatus);
    localFiles.pushWorkspaceGitCommitToRemote.mockResolvedValue(publishedStatus);
    actions.applyGitStatus.mockReturnValue(true);
    actions.captureGitRepositoryContext.mockReturnValue(repositoryContext);
    actions.isGitRepositoryContextCurrent.mockReturnValue(true);
    actions.onConfigureCloudRemote.mockResolvedValue(publishedStatus);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("does nothing passively, then signs in and automatically resumes publishing", async () => {
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);

    await render(<PublishHarness activeSession={null} startCloudBrowserSignIn={startCloudBrowserSignIn} />);
    expect(startCloudBrowserSignIn).not.toHaveBeenCalled();
    expect(cloudApi.createCloudProject).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
      await Promise.resolve();
    });

    expect(startCloudBrowserSignIn).toHaveBeenCalledOnce();
    expect(readOutput().dataset.pending).toBe("true");
    expect(cloudApi.createCloudProject).not.toHaveBeenCalled();

    await render(<PublishHarness activeSession={session} startCloudBrowserSignIn={startCloudBrowserSignIn} />);
    await flushPromises();

    expect(cloudApi.createCloudProject).toHaveBeenCalledWith(
      session,
      "Local Notes",
      actions.handleCloudSessionChange,
    );
    expect(actions.onConfigureCloudRemote).toHaveBeenCalledWith("project-1", {
      persistWorkspacePreferences: false,
      requireWrite: true,
      deferStatusPublication: true,
      rejectRemoteNameCollision: true,
      expectedHeadCommitId: initialStatus.headCommitId,
      expectedBranch: initialStatus.branch,
    });
    expect(localFiles.pushWorkspaceGitCommitToRemote).toHaveBeenCalledWith(repositoryContext.rootPath, {
      remoteName: "puppyone",
      destinationBranch: "main",
      expectedHeadCommitId: initialStatus.headCommitId,
      expectedBranch: initialStatus.branch,
    });
    expect(localFiles.getWorkspaceGitStatus).toHaveBeenCalledTimes(3);
    expect(actions.applyGitStatus).toHaveBeenCalledWith(
      publishedStatus,
      repositoryContext,
      expect.objectContaining({ detail: "cloud-backup", source: "mutation" }),
    );
    expect(readOutput().dataset.pending).toBe("false");
    expect(readOutput().dataset.loading).toBe("false");
  });

  it("pushes an existing dirty HEAD without staging or creating a commit", async () => {
    const dirtyStatus = {
      ...initialStatus,
      entries: [
        { path: "README.md", oldPath: null, staged: "M", unstaged: null, status: "M" },
        { path: "src/draft.ts", oldPath: null, staged: null, unstaged: "M", status: "M" },
        { path: "notes.txt", oldPath: null, staged: null, unstaged: "?", status: "?" },
      ],
      stagedEntries: [{ path: "README.md", oldPath: null, staged: "M", unstaged: null, status: "M" }],
      unstagedEntries: [{ path: "src/draft.ts", oldPath: null, staged: null, unstaged: "M", status: "M" }],
      untrackedEntries: [{ path: "notes.txt", oldPath: null, staged: null, unstaged: "?", status: "?" }],
    } as GitStatusSnapshot;
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    localFiles.getWorkspaceGitStatus.mockResolvedValue(dirtyStatus);

    await render(
      <PublishHarness
        activeSession={session}
        activeStatus={dirtyStatus}
        startCloudBrowserSignIn={startCloudBrowserSignIn}
      />,
    );
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    await flushPromises();

    expect(localFiles.initializeWorkspaceGitRepository).not.toHaveBeenCalled();
    expect(localFiles.stageAllWorkspaceGitChanges).not.toHaveBeenCalled();
    expect(localFiles.commitWorkspaceGit).not.toHaveBeenCalled();
    expect(cloudApi.createCloudProject).toHaveBeenCalledWith(
      session,
      "Local Notes",
      actions.handleCloudSessionChange,
    );
    expect(actions.onConfigureCloudRemote).toHaveBeenCalledWith("project-1", expect.objectContaining({
      expectedHeadCommitId: dirtyStatus.headCommitId,
      expectedBranch: dirtyStatus.branch,
    }));
    expect(localFiles.pushWorkspaceGitCommitToRemote).toHaveBeenCalledWith(
      repositoryContext.rootPath,
      expect.objectContaining({ expectedHeadCommitId: dirtyStatus.headCommitId }),
    );
    expect(readOutput().dataset.error).toBe("");
  });

  it("rejects a repository without a HEAD before mutating the Cloud project", async () => {
    const noHeadStatus = {
      ...initialStatus,
      headCommitId: null,
      totalCommits: 0,
    } as GitStatusSnapshot;
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    localFiles.getWorkspaceGitStatus.mockResolvedValue(noHeadStatus);

    await render(
      <PublishHarness
        activeSession={session}
        activeStatus={noHeadStatus}
        startCloudBrowserSignIn={startCloudBrowserSignIn}
      />,
    );
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    await flushPromises();

    expect(readOutput().dataset.pending).toBe("false");
    expect(readOutput().dataset.loading).toBe("false");
    expect(readOutput().dataset.error).toBe("project-publish-commit-required");
    expect(cloudApi.createCloudProject).not.toHaveBeenCalled();
    expect(actions.onConfigureCloudRemote).not.toHaveBeenCalled();
    expect(localFiles.pushWorkspaceGitCommitToRemote).not.toHaveBeenCalled();
  });

  it.each([
    ["detached HEAD", "HEAD"],
    ["the normalized detached marker", "detached"],
    ["a missing current branch", null],
  ] as const)("rejects %s before mutating the Cloud project", async (_label, branch) => {
    const detachedStatus = {
      ...initialStatus,
      branch,
    } as GitStatusSnapshot;
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    localFiles.getWorkspaceGitStatus.mockResolvedValue(detachedStatus);

    await render(
      <PublishHarness
        activeSession={session}
        activeStatus={detachedStatus}
        startCloudBrowserSignIn={startCloudBrowserSignIn}
      />,
    );
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    await flushPromises();

    expect(readOutput().dataset.pending).toBe("false");
    expect(readOutput().dataset.loading).toBe("false");
    expect(readOutput().dataset.error).toBe("project-publish-branch-required");
    expect(cloudApi.createCloudProject).not.toHaveBeenCalled();
    expect(actions.onConfigureCloudRemote).not.toHaveBeenCalled();
    expect(localFiles.pushWorkspaceGitCommitToRemote).not.toHaveBeenCalled();
  });

  it("clears the pending state when browser sign-in cannot start", async () => {
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(false);
    await render(<PublishHarness activeSession={null} startCloudBrowserSignIn={startCloudBrowserSignIn} />);

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
      await Promise.resolve();
    });

    expect(readOutput().dataset.pending).toBe("false");
    expect(readOutput().dataset.error).toBe("auth-start-failed");
    expect(cloudApi.createCloudProject).not.toHaveBeenCalled();
  });

  it("surfaces an OAuth callback failure on the local-only page", async () => {
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    await render(<PublishHarness activeSession={null} startCloudBrowserSignIn={startCloudBrowserSignIn} />);

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
      await Promise.resolve();
    });
    expect(readOutput().dataset.pending).toBe("true");

    await act(async () => {
      cloudSession.authErrorListener?.("The browser sign-in was denied.");
      await Promise.resolve();
    });

    expect(readOutput().dataset.pending).toBe("false");
    expect(readOutput().dataset.error).toBe("auth-start-failed");
    expect(readOutput().dataset.errorDetail).toBe("The browser sign-in was denied.");
  });

  it("settles the publish intent when the repository context cannot be captured", async () => {
    actions.captureGitRepositoryContext.mockReturnValue(null);
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    await render(<PublishHarness activeSession={session} startCloudBrowserSignIn={startCloudBrowserSignIn} />);

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    await flushPromises();

    expect(readOutput().dataset.pending).toBe("false");
    expect(readOutput().dataset.loading).toBe("false");
    expect(readOutput().dataset.error).toBe("project-publish-failed");
    expect(cloudApi.createCloudProject).not.toHaveBeenCalled();
  });

  it("settles the publish intent if the repository changes before Project creation", async () => {
    actions.isGitRepositoryContextCurrent.mockReturnValue(false);
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    await render(<PublishHarness activeSession={session} startCloudBrowserSignIn={startCloudBrowserSignIn} />);

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    await flushPromises();

    expect(readOutput().dataset.pending).toBe("false");
    expect(readOutput().dataset.loading).toBe("false");
    expect(readOutput().dataset.error).toBe("project-publish-failed");
    expect(cloudApi.createCloudProject).not.toHaveBeenCalled();
  });

  it("rejects a same-name puppyone remote before creating a Cloud project", async () => {
    localFiles.getWorkspaceGitStatus.mockResolvedValue({
      ...initialStatus,
      remotes: [{
        name: "PuppyOne",
        fetchUrl: "https://example.com/already-used.git",
        pushUrl: "https://example.com/already-used.git",
        branches: [],
      }],
    });
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    await render(<PublishHarness activeSession={session} startCloudBrowserSignIn={startCloudBrowserSignIn} />);

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    await flushPromises();

    expect(cloudApi.createCloudProject).not.toHaveBeenCalled();
    expect(actions.onConfigureCloudRemote).not.toHaveBeenCalled();
    expect(localFiles.pushWorkspaceGitCommitToRemote).not.toHaveBeenCalled();
    expect(readOutput().dataset.errorDetail).toMatch(/remote named 'puppyone'/i);
  });

  it("records the created Project and reuses it when remote configuration is retried", async () => {
    actions.onConfigureCloudRemote
      .mockRejectedValueOnce(new Error("temporary credential service failure"))
      .mockResolvedValueOnce(publishedStatus);
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    await render(<PublishHarness activeSession={session} startCloudBrowserSignIn={startCloudBrowserSignIn} />);

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    await flushPromises();

    expect(cloudApi.createCloudProject).toHaveBeenCalledOnce();
    expect(readOutput().dataset.continuationProject).toBe("project-1");
    expect(readOutput().dataset.continuationPhase).toBe("project-created");
    expect(readOutput().dataset.canRetry).toBe("true");

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    await flushPromises();

    expect(cloudApi.createCloudProject).toHaveBeenCalledOnce();
    expect(actions.onConfigureCloudRemote).toHaveBeenCalledTimes(2);
    expect(localFiles.pushWorkspaceGitCommitToRemote).toHaveBeenCalledOnce();
    expect(readOutput().dataset.continuationProject).toBe("");
    expect(readOutput().dataset.canRetry).toBe("false");
  });

  it("rechecks HEAD after remote configuration and never pushes a changed revision", async () => {
    const changedStatus = {
      ...initialStatus,
      headCommitId: "different-head",
    } as GitStatusSnapshot;
    localFiles.getWorkspaceGitStatus
      .mockResolvedValueOnce(initialStatus)
      .mockResolvedValueOnce(initialStatus)
      .mockResolvedValue(changedStatus);
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    await render(<PublishHarness activeSession={session} startCloudBrowserSignIn={startCloudBrowserSignIn} />);

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    await flushPromises();

    expect(cloudApi.createCloudProject).toHaveBeenCalledOnce();
    expect(actions.onConfigureCloudRemote).toHaveBeenCalledOnce();
    expect(localFiles.pushWorkspaceGitCommitToRemote).not.toHaveBeenCalled();
    expect(readOutput().dataset.continuationPhase).toBe("remote-configured");
    expect(readOutput().dataset.canRetry).toBe("true");
    expect(readOutput().dataset.errorDetail).toMatch(/branch or HEAD changed/i);
  });

  it("reconciles a completed push without recreating or repushing when renderer publication is retried", async () => {
    actions.applyGitStatus.mockReturnValue(false);
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    await render(<PublishHarness activeSession={session} startCloudBrowserSignIn={startCloudBrowserSignIn} />);

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    await flushPromises();

    expect(readOutput().dataset.pending).toBe("false");
    expect(readOutput().dataset.loading).toBe("false");
    expect(readOutput().dataset.error).toBe("project-publish-failed");
    expect(cloudApi.createCloudProject).toHaveBeenCalledOnce();
    expect(localFiles.pushWorkspaceGitCommitToRemote).toHaveBeenCalledOnce();
    expect(readOutput().dataset.continuationPhase).toBe("pushed");
    expect(readOutput().dataset.canRetry).toBe("true");

    actions.applyGitStatus.mockReturnValue(true);
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    await flushPromises();

    expect(cloudApi.createCloudProject).toHaveBeenCalledOnce();
    expect(actions.onConfigureCloudRemote).toHaveBeenCalledOnce();
    expect(localFiles.pushWorkspaceGitCommitToRemote).toHaveBeenCalledOnce();
    expect(readOutput().dataset.error).toBe("");
    expect(readOutput().dataset.continuationPhase).toBe("");
  });

  async function render(element: React.ReactNode) {
    await act(async () => {
      root.render(element);
      await Promise.resolve();
    });
  }

  async function flushPromises() {
    for (let index = 0; index < 8; index += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }

  function readOutput() {
    const output = container.querySelector<HTMLOutputElement>("output");
    if (!output) throw new Error("Publish state output was not rendered.");
    return output;
  }
});
