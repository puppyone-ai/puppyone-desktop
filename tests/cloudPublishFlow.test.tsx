/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopCloudSession } from "../src/lib/cloudApi";
import type { GitRepositoryContext } from "../src/features/source-control/gitRefreshScheduler";
import type {
  CloudPublishResult,
  CloudPublishState,
  GitStatusSnapshot,
} from "../src/types/electron";

const localFiles = vi.hoisted(() => ({
  abandonWorkspaceCloudPublish: vi.fn(),
  getWorkspaceCloudPublishState: vi.fn(),
  getWorkspaceGitStatus: vi.fn(),
  startOrResumeWorkspaceCloudPublish: vi.fn(),
  subscribeWorkspaceCloudPublishProgress: vi.fn(() => () => {}),
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
} as GitStatusSnapshot;

const repositoryContext = {
  rootPath: "/tmp/local-notes",
} as GitRepositoryContext;

const interruptedState = createPublishState({
  phase: "remote-configured",
  projectId: "project-1",
  organizationId: "org-from-journal",
  projectName: "Name from journal",
  expectedHeadCommitId: "journal-head",
  expectedBranch: "journal-branch",
  canResume: true,
  canAbandon: true,
});

const completedState = createPublishState({
  phase: "completed",
  projectId: "project-1",
  canResume: false,
  canAbandon: false,
});

const actions = {
  applyGitStatus: vi.fn(() => true),
  captureGitRepositoryContext: vi.fn(() => repositoryContext),
  clearGitSelection: vi.fn(),
  isGitRepositoryContextCurrent: vi.fn(() => true),
  refreshWorkspaceContent: vi.fn(),
  setActiveCloudSection: vi.fn(),
  setActiveView: vi.fn(),
  setSidebarCollapsed: vi.fn(),
  setSwitcherOpen: vi.fn(),
};

function PublishHarness({
  activeSession,
  startCloudBrowserSignIn,
}: {
  activeSession: DesktopCloudSession | null;
  startCloudBrowserSignIn: () => Promise<boolean>;
}) {
  const publish = usePuppyoneCloudBackup({
    activeCloudSession: activeSession,
    applyGitStatus: actions.applyGitStatus,
    captureGitRepositoryContext: actions.captureGitRepositoryContext,
    clearGitSelection: actions.clearGitSelection,
    cloudEnabled: true,
    desktopCloudApiBaseUrl: "https://cloud.example/api/v1",
    isGitRepositoryContextCurrent: actions.isGitRepositoryContextCurrent,
    refreshWorkspaceContent: actions.refreshWorkspaceContent,
    setActiveCloudSection: actions.setActiveCloudSection,
    setActiveView: actions.setActiveView,
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
      <button type="button" data-action="start" onClick={() => void publish.handleStartPuppyoneBackup("org-1")}>
        Start
      </button>
      <button type="button" data-action="resume" onClick={() => void publish.handleStartPuppyoneBackup()}>
        Resume
      </button>
      <button type="button" data-action="abandon" onClick={() => void publish.handleAbandonPuppyoneBackup()}>
        Abandon
      </button>
      <output
        data-pending={String(publish.pendingCloudBackupSetup)}
        data-loading={String(publish.cloudBackupLoading)}
        data-state-loading={String(publish.cloudPublishStateLoading)}
        data-error={publish.cloudPublishError?.code ?? ""}
        data-retryable={String(publish.cloudPublishError?.retryable ?? false)}
        data-phase={publish.cloudPublishState?.phase ?? ""}
        data-progress={publish.cloudPublishProgress?.stage ?? ""}
        data-project={publish.cloudPublishState?.projectId ?? ""}
        data-notice={publish.cloudPublishNotice ?? ""}
      />
    </>
  );
}

describe("durable PuppyOne Cloud publish renderer flow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    cloudSession.authErrorListener = null;
    localFiles.getWorkspaceCloudPublishState.mockResolvedValue(okResult(null));
    localFiles.getWorkspaceGitStatus.mockResolvedValue(initialStatus);
    localFiles.startOrResumeWorkspaceCloudPublish.mockResolvedValue(okResult(completedState, publishedStatus));
    localFiles.subscribeWorkspaceCloudPublishProgress.mockImplementation(() => () => {});
    localFiles.abandonWorkspaceCloudPublish.mockResolvedValue(okResult(null, initialStatus));
    actions.applyGitStatus.mockReturnValue(true);
    actions.captureGitRepositoryContext.mockReturnValue(repositoryContext);
    actions.isGitRepositoryContextCurrent.mockReturnValue(true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("stays passive and preserves a signed-out publish intent across login", async () => {
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);

    await render(<PublishHarness activeSession={null} startCloudBrowserSignIn={startCloudBrowserSignIn} />);
    expect(localFiles.getWorkspaceCloudPublishState).not.toHaveBeenCalled();
    expect(localFiles.startOrResumeWorkspaceCloudPublish).not.toHaveBeenCalled();

    await click("start");
    expect(startCloudBrowserSignIn).toHaveBeenCalledOnce();
    expect(readOutput().dataset.pending).toBe("true");

    await render(<PublishHarness activeSession={session} startCloudBrowserSignIn={startCloudBrowserSignIn} />);
    await flushPromises();

    expect(localFiles.getWorkspaceCloudPublishState).toHaveBeenCalledWith({
      rootPath: repositoryContext.rootPath,
      apiBaseUrl: session.api_base_url,
      userId: session.user_id,
    });
    expect(readOutput().dataset.pending).toBe("true");
    expect(localFiles.startOrResumeWorkspaceCloudPublish).not.toHaveBeenCalled();
  });

  it("starts with explicit ownership and fresh immutable Git expectations", async () => {
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    await render(<PublishHarness activeSession={session} startCloudBrowserSignIn={startCloudBrowserSignIn} />);
    await flushPromises();

    await click("start");
    await flushPromises();

    expect(localFiles.getWorkspaceGitStatus).toHaveBeenCalledOnce();
    expect(localFiles.startOrResumeWorkspaceCloudPublish).toHaveBeenCalledWith({
      rootPath: repositoryContext.rootPath,
      apiBaseUrl: session.api_base_url,
      userId: session.user_id,
      organizationId: "org-1",
      projectName: "Local Notes",
      expectedHeadCommitId: initialStatus.headCommitId,
      expectedBranch: "main",
    });
    expect(actions.applyGitStatus).toHaveBeenCalledWith(
      publishedStatus,
      repositoryContext,
      expect.objectContaining({ detail: "cloud-backup", source: "mutation" }),
    );
    expect(actions.clearGitSelection).toHaveBeenCalledOnce();
    expect(actions.setActiveCloudSection).toHaveBeenCalledWith("contents");
    expect(actions.setActiveView).toHaveBeenCalledWith("cloud");
    expect(readOutput().dataset.phase).toBe("");
    expect(readOutput().dataset.error).toBe("");
  });

  it("applies main-process publish progress while the durable operation is running", async () => {
    let finishPublish!: (result: CloudPublishResult) => void;
    localFiles.startOrResumeWorkspaceCloudPublish.mockReturnValue(new Promise((resolve) => {
      finishPublish = resolve;
    }));
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    await render(<PublishHarness activeSession={session} startCloudBrowserSignIn={startCloudBrowserSignIn} />);
    await flushPromises();

    await click("start");
    expect(readOutput().dataset.progress).toBe("validating");
    const progressListener = localFiles.subscribeWorkspaceCloudPublishProgress.mock.calls.at(-1)?.[0];
    expect(progressListener).toBeTypeOf("function");
    await act(async () => {
      progressListener?.({
        rootPath: repositoryContext.rootPath,
        operationId: interruptedState.operationId,
        stage: "uploading",
        state: interruptedState,
        updatedAt: "2026-07-17T00:00:00.000Z",
      });
      await Promise.resolve();
    });

    expect(readOutput().dataset.progress).toBe("uploading");
    expect(readOutput().dataset.phase).toBe("remote-configured");

    finishPublish(okResult(completedState, publishedStatus));
    await flushPromises();
    expect(readOutput().dataset.progress).toBe("");
  });

  it("restores and resumes the coordinator journal without deriving a new identity", async () => {
    localFiles.getWorkspaceCloudPublishState.mockResolvedValue(okResult(interruptedState));
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    await render(<PublishHarness activeSession={session} startCloudBrowserSignIn={startCloudBrowserSignIn} />);
    await flushPromises();

    expect(readOutput().dataset.phase).toBe("remote-configured");
    expect(readOutput().dataset.project).toBe("project-1");

    await click("resume");
    await flushPromises();

    expect(localFiles.getWorkspaceGitStatus).not.toHaveBeenCalled();
    expect(localFiles.startOrResumeWorkspaceCloudPublish).toHaveBeenCalledWith({
      rootPath: repositoryContext.rootPath,
      apiBaseUrl: session.api_base_url,
      userId: session.user_id,
      organizationId: interruptedState.organizationId,
      projectName: interruptedState.projectName,
      expectedHeadCommitId: interruptedState.expectedHeadCommitId,
      expectedBranch: interruptedState.expectedBranch,
    });
  });

  it("keeps typed coordinator failure state for an explicit retry", async () => {
    const failedState = createPublishState({
      phase: "project-created",
      projectId: "project-1",
      canResume: true,
      canAbandon: true,
    });
    localFiles.startOrResumeWorkspaceCloudPublish.mockResolvedValue({
      ok: false,
      state: failedState,
      error: { code: "REMOTE_CONFIG_FAILED", retryable: true, message: "private diagnostic" },
    } satisfies CloudPublishResult);
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    await render(<PublishHarness activeSession={session} startCloudBrowserSignIn={startCloudBrowserSignIn} />);
    await flushPromises();

    await click("start");
    await flushPromises();

    expect(readOutput().dataset.phase).toBe("project-created");
    expect(readOutput().dataset.error).toBe("REMOTE_CONFIG_FAILED");
    expect(readOutput().dataset.retryable).toBe("true");
    expect(container.textContent).not.toContain("private diagnostic");
  });

  it("abandons the exact journal operation and reconciles local Git state", async () => {
    localFiles.getWorkspaceCloudPublishState.mockResolvedValue(okResult(interruptedState));
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    await render(<PublishHarness activeSession={session} startCloudBrowserSignIn={startCloudBrowserSignIn} />);
    await flushPromises();

    await click("abandon");
    await flushPromises();

    expect(localFiles.abandonWorkspaceCloudPublish).toHaveBeenCalledWith({
      rootPath: repositoryContext.rootPath,
      apiBaseUrl: session.api_base_url,
      userId: session.user_id,
      operationId: interruptedState.operationId,
    });
    expect(actions.applyGitStatus).toHaveBeenCalledWith(
      initialStatus,
      repositoryContext,
      expect.objectContaining({ detail: "cloud-backup", source: "mutation" }),
    );
    expect(actions.setActiveCloudSection).toHaveBeenCalledWith("initialize");
    expect(readOutput().dataset.phase).toBe("");
    expect(readOutput().dataset.notice).toBe("abandoned");
  });

  it("clears a pending browser sign-in intent after an auth callback failure", async () => {
    const startCloudBrowserSignIn = vi.fn().mockResolvedValue(true);
    await render(<PublishHarness activeSession={null} startCloudBrowserSignIn={startCloudBrowserSignIn} />);
    await click("start");
    expect(readOutput().dataset.pending).toBe("true");

    await act(async () => {
      cloudSession.authErrorListener?.("The browser sign-in was denied.");
      await Promise.resolve();
    });

    expect(readOutput().dataset.pending).toBe("false");
    expect(readOutput().dataset.error).toBe("SESSION_REQUIRED");
  });

  async function render(element: React.ReactNode) {
    await act(async () => {
      root.render(element);
      await Promise.resolve();
    });
  }

  async function click(action: "start" | "resume" | "abandon") {
    await act(async () => {
      container.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.click();
      await Promise.resolve();
    });
  }

  async function flushPromises() {
    for (let index = 0; index < 6; index += 1) {
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

function createPublishState(overrides: Partial<CloudPublishState>): CloudPublishState {
  return {
    operationId: "11111111-1111-4111-8111-111111111111",
    phase: "prepared",
    projectId: null,
    projectName: "Local Notes",
    organizationId: "org-1",
    expectedHeadCommitId: "head-before-publish",
    expectedBranch: "main",
    destinationBranch: "main",
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:01.000Z",
    canResume: true,
    canAbandon: false,
    ...overrides,
  };
}

function okResult(
  state: CloudPublishState | null,
  gitStatus?: GitStatusSnapshot,
): Extract<CloudPublishResult, { ok: true }> {
  return { ok: true, state, ...(gitStatus ? { gitStatus } : {}) };
}
