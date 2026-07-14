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

function ResolutionProbe({
  workspace,
  gitStatus,
  workspaceConfig,
}: {
  workspace: Workspace;
  gitStatus: GitStatusSnapshot;
  workspaceConfig?: PuppyoneWorkspaceConfig;
}) {
  const [bindings, setBindings] = React.useState<Record<string, RecentWorkspaceCloudBinding>>({});
  const [projects, setProjects] = React.useState<Array<{ id: string; name: string }>>([]);
  const updateSession = React.useCallback(() => undefined, []);
  const saveConfig = React.useCallback(async (next: PuppyoneWorkspaceConfig) => next, []);
  const effectiveConfig = React.useMemo(
    () => workspaceConfig ?? config(workspace),
    [workspace, workspaceConfig],
  );

  useCloudWorkspaceBinding({
    activeCloudSession: session,
    activeGitStatus: gitStatus,
    cloudEnabled: true,
    desktopCloudApiBaseUrl: session.api_base_url,
    handlePuppyoneConfigChange: saveConfig,
    homeCloudProjects: projects,
    puppyoneConfig: effectiveConfig,
    setHomeCloudProjects: setProjects,
    setRecentWorkspaceCloudBindings: setBindings,
    updateCloudSession: updateSession,
    workspace,
    workspaceIsCloud: false,
  });

  return (
    <output
      data-bindings={JSON.stringify(bindings)}
      data-projects={JSON.stringify(projects)}
    />
  );
}

function readBindings(container: HTMLElement) {
  return JSON.parse(
    container.querySelector("output")?.getAttribute("data-bindings") ?? "{}",
  ) as Record<string, RecentWorkspaceCloudBinding>;
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

  it("keeps an authorized binding context but warns when its Git remote is missing", async () => {
    const workspace = localWorkspace("workspace-bound");
    cloudApi.getCloudWorkspaceBinding.mockResolvedValue({
      id: "binding-1",
      project_id: "project-1",
      org_id: "org-1",
      scope_id: "scope-root",
      scope_path: null,
      workspace_instance_id: workspace.workspaceInstanceId,
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
    });
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
});
