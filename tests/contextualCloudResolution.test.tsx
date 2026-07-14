/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "@puppyone/shared-ui";
import type {
  DesktopCloudCanonicalProjectContext,
  DesktopCloudSession,
  DesktopCloudWorkspaceBinding,
} from "../src/lib/cloudApi";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../src/types/electron";

const cloudApi = vi.hoisted(() => ({
  getCloudProject: vi.fn(),
  getCloudProjectReadiness: vi.fn(),
  getCloudWorkspaceBinding: vi.fn(),
  resolveCanonicalCloudWorkspaceRemote: vi.fn(),
  resolveLegacyCloudWorkspaceRemote: vi.fn(),
}));

vi.mock("../src/lib/cloudApi", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/cloudApi")>("../src/lib/cloudApi");
  return { ...actual, ...cloudApi };
});

import { useCloudWorkspaceBinding } from "../src/features/cloud/workspace/useCloudWorkspaceBinding";
import type { RecentWorkspaceCloudBinding } from "../src/features/cloud/workspace/cloudProjectResolution";
import { useProjectCloudAttachment } from "../src/features/cloud/attachment/useProjectCloudAttachment";
import {
  createWorkspaceCloudResolutionKey,
  shouldBlockWorkspaceCloudResolution,
} from "../src/features/cloud/workspace/workspaceCloudResolutionKey";

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
} satisfies DesktopCloudSession;

function localWorkspace(id: string): Workspace {
  return {
    id,
    name: id,
    path: `/tmp/${id}`,
    workspaceInstanceId: `instance-${id}`,
  } as Workspace;
}

function status(...urls: string[]): GitStatusSnapshot {
  return {
    remotes: urls.map((url, index) => ({
      name: `remote-${index}`,
      fetchUrl: url,
      pushUrl: url,
      branches: [],
    })),
  } as GitStatusSnapshot;
}

function config(
  workspace: Workspace,
  projectId: string | null = null,
  bindingId: string | null = null,
): PuppyoneWorkspaceConfig {
  return {
    version: 2,
    project: { id: null, workspaceInstanceId: workspace.workspaceInstanceId ?? null },
    sync: { sourceOfTruth: { service: "puppyone", remote: null, branch: null } },
    git: { primaryRemote: null, watchedBranch: null },
    backup: { enabled: false, service: "puppyone", remote: null, branch: null },
    cloud: {
      projectId,
      bindingId,
      origin: projectId ? "https://cloud.example" : null,
    },
  };
}

function canonicalContext(
  projectId: string,
  scopeId = "scope-root",
  kind: "full" | "scoped" = "full",
): DesktopCloudCanonicalProjectContext {
  return {
    project: {
      id: projectId,
      name: `Project ${projectId}`,
      description: null,
      org_id: "org-1",
      visibility: "private",
      bound_git_branch: "main",
      effective_role: "editor",
      grant_source: "project_member",
      capabilities: ["project.read", "content.read"],
    },
    scope: {
      id: scopeId,
      kind,
      path: kind === "scoped" ? "docs" : null,
    },
    locator: {
      project_id: projectId,
      scope_id: scopeId,
      binding_kind: kind,
    },
  };
}

function workspaceBinding(
  workspace: Workspace,
  overrides: Partial<DesktopCloudWorkspaceBinding> = {},
): DesktopCloudWorkspaceBinding {
  return {
    id: "binding-1",
    project_id: "project-1",
    org_id: "org-1",
    scope_id: "scope-root",
    scope_path: null,
    workspace_instance_id: workspace.workspaceInstanceId ?? "",
    bound_user_id: "user-1",
    cloud_origin: "https://cloud.example",
    binding_kind: "full",
    mode: "rw",
    status: "active",
    usable: true,
    created_at: "2026-07-14T00:00:00Z",
    updated_at: "2026-07-14T00:00:00Z",
    last_seen_at: "2026-07-14T00:00:00Z",
    remote: {
      url: "https://cloud.example/git/project-1.git",
      project_id: "project-1",
      scope_id: "scope-root",
      kind: "full",
      username: "x-puppyone-token",
    },
    ...overrides,
  };
}

function ResolutionProbe({
  workspace,
  gitStatus,
  workspaceConfig,
  activeSession = session,
  resolutionInputsLoading = false,
}: {
  workspace: Workspace;
  gitStatus: GitStatusSnapshot;
  workspaceConfig?: PuppyoneWorkspaceConfig;
  activeSession?: DesktopCloudSession | null;
  resolutionInputsLoading?: boolean;
}) {
  const [bindings, setBindings] = React.useState<Record<string, RecentWorkspaceCloudBinding>>({});
  const updateSession = React.useCallback(() => undefined, []);
  const effectiveConfig = React.useMemo(
    () => workspaceConfig ?? config(workspace),
    [workspace, workspaceConfig],
  );

  useCloudWorkspaceBinding({
    activeCloudSession: activeSession,
    activeGitStatus: gitStatus,
    cloudEnabled: true,
    desktopCloudApiBaseUrl: session.api_base_url,
    puppyoneConfig: effectiveConfig,
    resolutionInputsLoading,
    setRecentWorkspaceCloudBindings: setBindings,
    updateCloudSession: updateSession,
    workspace,
    workspaceIsCloud: false,
  });

  return <output data-bindings={JSON.stringify(bindings)} />;
}

function readBindings(container: HTMLElement) {
  return JSON.parse(
    container.querySelector("output")?.getAttribute("data-bindings") ?? "{}",
  ) as Record<string, RecentWorkspaceCloudBinding>;
}

function AttachmentProbe({
  workspace,
  gitStatus,
  workspaceConfig,
  bindings,
}: {
  workspace: Workspace;
  gitStatus: GitStatusSnapshot;
  workspaceConfig: PuppyoneWorkspaceConfig;
  bindings: Record<string, RecentWorkspaceCloudBinding>;
}) {
  const attachment = useProjectCloudAttachment({
    workspace,
    workspaceIsCloud: false,
    puppyoneConfig: workspaceConfig,
    recentWorkspaceCloudBindings: bindings,
    activeGitStatus: gitStatus,
    activeCloudSession: session,
    desktopCloudApiBaseUrl: session.api_base_url,
    resolutionInputsLoading: false,
  });
  return <output data-attachment={JSON.stringify(attachment)} />;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

beforeEach(() => {
  vi.clearAllMocks();
  cloudApi.getCloudProjectReadiness.mockResolvedValue({
    project_id: "project-1",
    git: { state: "ready" },
    claude: { ready: true, blockers: [] },
  });
});

describe("current Local workspace Cloud context", () => {
  it("blocks only the initial Git snapshot, not background Git refreshes", () => {
    expect(shouldBlockWorkspaceCloudResolution({
      gitStatusError: null,
      gitStatusPath: null,
      puppyoneConfigLoading: false,
      workspacePath: "/tmp/workspace-a",
    })).toBe(true);
    expect(shouldBlockWorkspaceCloudResolution({
      gitStatusError: null,
      gitStatusPath: "/tmp/workspace-a",
      puppyoneConfigLoading: false,
      workspacePath: "/tmp/workspace-a",
    })).toBe(false);
    expect(shouldBlockWorkspaceCloudResolution({
      gitStatusError: "Git status unavailable",
      gitStatusPath: null,
      puppyoneConfigLoading: false,
      workspacePath: "/tmp/workspace-a",
    })).toBe(false);
  });

  it("authorizes a canonical scoped locator and resolves it without creating a binding", async () => {
    const workspace = localWorkspace("workspace-a");
    const remoteUrl = "https://cloud.example/git/project-1/scopes/scope-docs.git";
    cloudApi.resolveCanonicalCloudWorkspaceRemote.mockResolvedValue(
      canonicalContext("project-1", "scope-docs", "scoped"),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ResolutionProbe workspace={workspace} gitStatus={status(remoteUrl)} />);
      await flushPromises();
    });

    expect(cloudApi.resolveCanonicalCloudWorkspaceRemote).toHaveBeenCalledWith(
      session,
      remoteUrl,
      expect.any(Function),
      session.api_base_url,
    );
    expect(readBindings(container)[workspace.id]).toMatchObject({
      projectId: "project-1",
      resolutionSource: "canonical-remote",
      bindingStatus: "not-bound",
      bindingId: null,
      bindingKind: "scoped",
      scopeId: "scope-docs",
      scopePath: "docs",
      error: null,
    });
    expect(cloudApi.getCloudWorkspaceBinding).not.toHaveBeenCalled();
  });

  it("authorizes a canonical root locator and preserves the resolved root scope", async () => {
    const workspace = localWorkspace("workspace-root");
    const remoteUrl = "https://cloud.example/git/project-1.git";
    cloudApi.resolveCanonicalCloudWorkspaceRemote.mockResolvedValue(
      canonicalContext("project-1"),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ResolutionProbe workspace={workspace} gitStatus={status(remoteUrl)} />);
      await flushPromises();
    });

    expect(readBindings(container)[workspace.id]).toMatchObject({
      projectId: "project-1",
      resolutionSource: "canonical-remote",
      bindingStatus: "not-bound",
      bindingKind: "full",
      scopeId: "scope-root",
      scopePath: null,
    });
    expect(cloudApi.resolveLegacyCloudWorkspaceRemote).not.toHaveBeenCalled();
    expect(cloudApi.getCloudWorkspaceBinding).not.toHaveBeenCalled();
  });

  it("keeps no-locator workspaces local-only and rejects incomplete binding identity", async () => {
    const localOnly = localWorkspace("workspace-local-only");
    const malformedBinding = localWorkspace("workspace-malformed-binding");
    const malformedConfig = config(malformedBinding);
    malformedConfig.cloud.bindingId = "binding-without-project";
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ResolutionProbe workspace={localOnly} gitStatus={status()} />);
      await flushPromises();
    });
    expect(readBindings(container)[localOnly.id]).toMatchObject({
      projectId: null,
      cloudLinked: false,
      error: null,
    });

    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={malformedBinding}
          workspaceConfig={malformedConfig}
          gitStatus={status()}
        />,
      );
      await flushPromises();
    });
    expect(readBindings(container)[malformedBinding.id]).toMatchObject({
      projectId: null,
      bindingId: "binding-without-project",
      reason: "binding-revoked",
    });
    expect(cloudApi.resolveCanonicalCloudWorkspaceRemote).not.toHaveBeenCalled();
    expect(cloudApi.getCloudWorkspaceBinding).not.toHaveBeenCalled();
  });

  it("stays unresolved until workspace config and Git discovery are complete", async () => {
    const workspace = localWorkspace("workspace-loading");
    const remoteUrl = "https://cloud.example/git/project-1.git";
    cloudApi.resolveCanonicalCloudWorkspaceRemote.mockResolvedValue(
      canonicalContext("project-1"),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={workspace}
          gitStatus={status(remoteUrl)}
          resolutionInputsLoading
        />,
      );
      await flushPromises();
    });
    expect(readBindings(container)[workspace.id]).toMatchObject({
      projectId: null,
      resolutionPending: true,
      error: null,
    });
    expect(cloudApi.resolveCanonicalCloudWorkspaceRemote).not.toHaveBeenCalled();
    expect(cloudApi.getCloudWorkspaceBinding).not.toHaveBeenCalled();

    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={workspace}
          gitStatus={status(remoteUrl)}
          resolutionInputsLoading={false}
        />,
      );
      await flushPromises();
    });
    expect(readBindings(container)[workspace.id]).toMatchObject({
      projectId: "project-1",
      resolutionSource: "canonical-remote",
      bindingStatus: "not-bound",
      error: null,
    });
  });

  it("never promotes a cached result from an earlier resolution context", async () => {
    const workspace = localWorkspace("workspace-stale-cache");
    const gitStatus = status("https://cloud.example/git/project-1.git");
    const workspaceConfig = config(workspace);
    const currentKey = createWorkspaceCloudResolutionKey({
      activeCloudSession: session,
      activeGitStatus: gitStatus,
      desktopCloudApiBaseUrl: session.api_base_url,
      puppyoneConfig: workspaceConfig,
      workspace,
    });
    const candidate = {
      projectId: "project-1",
      resolutionSource: "canonical-remote" as const,
      bindingStatus: "not-bound" as const,
      cloudLinked: true,
      error: null,
      reason: null,
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AttachmentProbe
          workspace={workspace}
          gitStatus={gitStatus}
          workspaceConfig={workspaceConfig}
          bindings={{
            [workspace.id]: { ...candidate, resolutionKey: "previous-account" },
          }}
        />,
      );
    });
    expect(JSON.parse(
      container.querySelector("output")?.getAttribute("data-attachment") ?? "{}",
    )).toEqual({ status: "resolving", projectId: null });

    await act(async () => {
      root?.render(
        <AttachmentProbe
          workspace={workspace}
          gitStatus={gitStatus}
          workspaceConfig={workspaceConfig}
          bindings={{
            [workspace.id]: { ...candidate, resolutionKey: currentKey },
          }}
        />,
      );
    });
    expect(JSON.parse(
      container.querySelector("output")?.getAttribute("data-attachment") ?? "{}",
    )).toMatchObject({
      status: "resolved",
      projectId: "project-1",
      resolutionSource: "canonical-remote",
      bindingStatus: "not-bound",
    });
  });

  it("distinguishes signed-out, wrong-host, unauthorized, missing, network, and legacy recovery", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const signedOut = localWorkspace("workspace-signed-out");
    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={signedOut}
          gitStatus={status("https://cloud.example/git/project-1.git")}
          activeSession={null}
        />,
      );
      await flushPromises();
    });
    expect(readBindings(container)[signedOut.id]?.reason).toBe("wrong-account");
    expect(readBindings(container)[signedOut.id]?.error).toEqual(
      expect.objectContaining({ code: "binding-switch-account" }),
    );

    const signedOutBinding = localWorkspace("workspace-signed-out-binding");
    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={signedOutBinding}
          workspaceConfig={config(signedOutBinding, "project-1", "binding-1")}
          gitStatus={status("https://cloud.example/git/project-1.git")}
          activeSession={null}
        />,
      );
      await flushPromises();
    });
    expect(readBindings(container)[signedOutBinding.id]).toMatchObject({
      projectId: null,
      candidateProjectId: "project-1",
      reason: "wrong-account",
    });
    expect(cloudApi.getCloudWorkspaceBinding).not.toHaveBeenCalled();

    const wrongHost = localWorkspace("workspace-wrong-host");
    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={wrongHost}
          gitStatus={status("https://other.example/git/project-1.git")}
        />,
      );
      await flushPromises();
    });
    expect(readBindings(container)[wrongHost.id]?.reason).toBe("wrong-host");

    for (const [id, error, reason] of [
      ["unauthorized", Object.assign(new Error("forbidden"), { status: 403 }), "not-authorized"],
      ["missing", Object.assign(new Error("missing"), { status: 404 }), "not-found"],
      ["unavailable", Object.assign(new Error("temporarily unavailable"), { status: 503 }), "network"],
      ["network", new Error("offline"), "network"],
    ] as const) {
      cloudApi.resolveCanonicalCloudWorkspaceRemote.mockRejectedValueOnce(error);
      const workspace = localWorkspace(`workspace-${id}`);
      await act(async () => {
        root?.render(
          <ResolutionProbe
            workspace={workspace}
            gitStatus={status("https://cloud.example/git/project-1.git")}
          />,
        );
        await flushPromises();
      });
      expect(readBindings(container)[workspace.id]?.reason).toBe(reason);
    }

    cloudApi.resolveLegacyCloudWorkspaceRemote.mockResolvedValueOnce({
      project_id: "project-1",
      scope_id: "scope-docs",
      binding_kind: "scoped",
      requires_confirmation: true,
    });
    const legacy = localWorkspace("workspace-legacy");
    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={legacy}
          gitStatus={status("https://cloud.example/git/ap/legacy-secret.git")}
        />,
      );
      await flushPromises();
    });
    expect(readBindings(container)[legacy.id]).toMatchObject({
      projectId: null,
      candidateProjectId: "project-1",
      candidateScopeId: "scope-docs",
      reason: "legacy-confirmation-required",
    });
  });

  it("fails closed before network I/O when a durable binding and canonical remote disagree", async () => {
    const workspace = localWorkspace("workspace-bound");
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={workspace}
          workspaceConfig={config(workspace, "project-1", "binding-1")}
          gitStatus={status("https://cloud.example/git/project-2.git")}
        />,
      );
      await flushPromises();
    });

    expect(readBindings(container)[workspace.id]).toMatchObject({
      projectId: null,
      candidateProjectId: "project-1",
      reason: "locator-conflict",
    });
    expect(cloudApi.getCloudWorkspaceBinding).not.toHaveBeenCalled();
    expect(cloudApi.resolveCanonicalCloudWorkspaceRemote).not.toHaveBeenCalled();
  });

  it("does not promote a configured Project when binding verification returns a retryable 503", async () => {
    const workspace = localWorkspace("workspace-binding-offline");
    cloudApi.getCloudWorkspaceBinding.mockRejectedValue(
      Object.assign(new Error("temporarily unavailable"), { status: 503 }),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={workspace}
          workspaceConfig={config(workspace, "project-1", "binding-1")}
          gitStatus={status()}
        />,
      );
      await flushPromises();
    });

    expect(readBindings(container)[workspace.id]).toMatchObject({
      projectId: null,
      candidateProjectId: "project-1",
      bindingId: "binding-1",
      reason: "network",
      error: { code: "binding-network-failed" },
    });
    expect(readBindings(container)[workspace.id]?.resolutionSource).toBeUndefined();
    expect(readBindings(container)[workspace.id]?.bindingStatus).toBeUndefined();
    expect(cloudApi.getCloudProject).not.toHaveBeenCalled();
  });

  it("keeps an exact Project context when Project details return a retryable 503 after binding verification", async () => {
    const workspace = localWorkspace("workspace-binding-details-offline");
    cloudApi.getCloudWorkspaceBinding.mockResolvedValue(workspaceBinding(workspace));
    cloudApi.getCloudProject.mockRejectedValue(
      Object.assign(new Error("temporarily unavailable"), { status: 503 }),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={workspace}
          workspaceConfig={config(workspace, "project-1", "binding-1")}
          gitStatus={status()}
        />,
      );
      await flushPromises();
    });

    expect(readBindings(container)[workspace.id]).toMatchObject({
      projectId: "project-1",
      resolutionSource: "workspace-binding",
      bindingStatus: "bound",
      bindingId: "binding-1",
      bindingKind: "full",
      scopeId: "scope-root",
      reason: "network",
      error: { code: "binding-network-failed" },
    });
  });

  it("keeps an authorized binding context but warns when its Git remote is missing", async () => {
    const workspace = localWorkspace("workspace-bound");
    cloudApi.getCloudWorkspaceBinding.mockResolvedValue(workspaceBinding(workspace));
    cloudApi.getCloudProject.mockResolvedValue({
      id: "project-1",
      name: "Project One",
      capabilities: ["project.read"],
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={workspace}
          workspaceConfig={config(workspace, "project-1", "binding-1")}
          gitStatus={status()}
        />,
      );
      await flushPromises();
    });

    expect(readBindings(container)[workspace.id]).toMatchObject({
      projectId: "project-1",
      resolutionSource: "workspace-binding",
      bindingStatus: "bound",
      error: { code: "binding-remote-missing" },
    });
  });

  it("enters an authorized binding before secondary Project readiness hydration", async () => {
    const workspace = localWorkspace("workspace-binding-fast-path");
    cloudApi.getCloudWorkspaceBinding.mockResolvedValue(workspaceBinding(workspace, {
      capabilities: ["project.read", "agent.read"],
    }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={workspace}
          workspaceConfig={config(workspace, "project-1", "binding-1")}
          gitStatus={status()}
        />,
      );
      await flushPromises();
    });

    expect(readBindings(container)[workspace.id]).toMatchObject({
      projectId: "project-1",
      resolutionSource: "workspace-binding",
      bindingStatus: "bound",
      capabilities: ["project.read", "agent.read"],
    });
    expect(cloudApi.getCloudProject).not.toHaveBeenCalled();
    expect(cloudApi.getCloudProjectReadiness).not.toHaveBeenCalled();
  });

  it("does not reauthorize when a background Git refresh keeps the same Cloud identity", async () => {
    const workspace = localWorkspace("workspace-binding-stable-refresh");
    cloudApi.getCloudWorkspaceBinding.mockResolvedValue(workspaceBinding(workspace, {
      capabilities: ["project.read"],
    }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={workspace}
          workspaceConfig={config(workspace, "project-1", "binding-1")}
          gitStatus={{ ...status(), headCommitId: "commit-a" } as GitStatusSnapshot}
        />,
      );
      await flushPromises();
    });
    expect(cloudApi.getCloudWorkspaceBinding).toHaveBeenCalledTimes(1);

    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={workspace}
          workspaceConfig={config(workspace, "project-1", "binding-1")}
          gitStatus={{ ...status(), headCommitId: "commit-b" } as GitStatusSnapshot}
        />,
      );
      await flushPromises();
    });

    expect(cloudApi.getCloudWorkspaceBinding).toHaveBeenCalledTimes(1);
    expect(readBindings(container)[workspace.id]?.projectId).toBe("project-1");
  });

  it("ignores a canonical resolver response after the workspace changes", async () => {
    const workspaceA = localWorkspace("workspace-a");
    const workspaceB = localWorkspace("workspace-b");
    const resultA = deferred<DesktopCloudCanonicalProjectContext>();
    cloudApi.resolveCanonicalCloudWorkspaceRemote.mockImplementation(
      (_session: DesktopCloudSession, remoteUrl: string) => (
        remoteUrl.includes("project-a")
          ? resultA.promise
          : Promise.resolve(canonicalContext("project-b"))
      ),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={workspaceA}
          gitStatus={status("https://cloud.example/git/project-a.git")}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={workspaceB}
          gitStatus={status("https://cloud.example/git/project-b.git")}
        />,
      );
      await flushPromises();
    });
    expect(readBindings(container)[workspaceB.id]?.projectId).toBe("project-b");

    await act(async () => {
      resultA.resolve(canonicalContext("project-a"));
      await flushPromises();
    });
    expect(readBindings(container)[workspaceB.id]?.projectId).toBe("project-b");
    expect(readBindings(container)[workspaceA.id]).toBeUndefined();
  });

  it("ignores a canonical resolver response from the previous account generation", async () => {
    const workspace = localWorkspace("workspace-account-race");
    const first = deferred<DesktopCloudCanonicalProjectContext>();
    const secondSession = {
      ...session,
      user_id: "user-2",
      user_email: "second@example.com",
      session_generation: "generation-2",
    } satisfies DesktopCloudSession;
    const firstContext = canonicalContext("project-1");
    firstContext.project.capabilities = ["account-one"];
    const secondContext = canonicalContext("project-1");
    secondContext.project.capabilities = ["account-two"];
    cloudApi.resolveCanonicalCloudWorkspaceRemote.mockImplementation(
      (activeSession: DesktopCloudSession) => (
        activeSession.user_id === "user-1" ? first.promise : Promise.resolve(secondContext)
      ),
    );
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={workspace}
          gitStatus={status("https://cloud.example/git/project-1.git")}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      root?.render(
        <ResolutionProbe
          workspace={workspace}
          gitStatus={status("https://cloud.example/git/project-1.git")}
          activeSession={secondSession}
        />,
      );
      await flushPromises();
    });
    expect(readBindings(container)[workspace.id]?.capabilities).toEqual(["account-two"]);

    await act(async () => {
      first.resolve(firstContext);
      await flushPromises();
    });
    expect(readBindings(container)[workspace.id]?.capabilities).toEqual(["account-two"]);
  });
});
