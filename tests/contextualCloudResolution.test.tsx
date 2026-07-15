/**
 * @vitest-environment happy-dom
 */
import React, { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "@puppyone/shared-ui";
import type { DesktopCloudSession } from "../src/lib/cloudApi";
import type { GitStatusSnapshot } from "../src/types/electron";

const cloudApi = vi.hoisted(() => ({
  getCloudRepositoryContext: vi.fn(),
}));

vi.mock("../src/lib/cloudApi", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/cloudApi")>("../src/lib/cloudApi");
  return { ...actual, ...cloudApi };
});

import { useCloudWorkspaceContext } from "../src/features/cloud/workspace/useCloudWorkspaceContext";
import type { RecentWorkspaceCloudContext } from "../src/features/cloud/workspace/cloudProjectResolution";
import { shouldBlockWorkspaceCloudResolution } from "../src/features/cloud/workspace/workspaceCloudResolutionKey";

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

const workspace: Workspace = {
  id: "local:notes",
  name: "Notes",
  path: "/tmp/notes",
  workspaceInstanceId: "local-only-instance",
  status: "protected",
};

function gitStatus(...remotes: Array<{ fetch: string; push?: string }>): GitStatusSnapshot {
  return {
    remotes: remotes.map((remote, index) => ({
      name: `remote-${index}`,
      fetchUrl: remote.fetch,
      pushUrl: remote.push ?? remote.fetch,
      branches: [],
    })),
  } as GitStatusSnapshot;
}

function ContextHarness({
  activeCloudSession = session,
  status,
}: {
  activeCloudSession?: DesktopCloudSession | null;
  status: GitStatusSnapshot;
}) {
  const [contexts, setContexts] = useState<Record<string, RecentWorkspaceCloudContext>>({});
  const updateCloudSession = React.useCallback(() => undefined, []);
  useCloudWorkspaceContext({
    activeCloudSession,
    activeGitStatus: status,
    cloudEnabled: true,
    desktopCloudApiBaseUrl: session.api_base_url,
    resolutionInputsLoading: false,
    setRecentWorkspaceCloudContexts: setContexts,
    updateCloudSession,
    workspace,
    workspaceIsCloud: false,
  });
  return <output data-context={JSON.stringify(contexts[workspace.id] ?? null)} />;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  cloudApi.getCloudRepositoryContext.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(element: React.ReactNode) {
  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const context = readContext();
    if (context) return context;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  return readContext();
}

function readContext(): RecentWorkspaceCloudContext | null {
  return JSON.parse(container.querySelector("output")?.getAttribute("data-context") ?? "null");
}

describe("remote-first Cloud repository context", () => {
  it("treats a repository without a PuppyOne remote as local-only and performs no Cloud request", async () => {
    const context = await render(<ContextHarness status={gitStatus()} />);
    expect(context).toMatchObject({
      projectId: null,
      hasCloudRemote: false,
      error: null,
      reason: null,
    });
    expect(cloudApi.getCloudRepositoryContext).not.toHaveBeenCalled();
  });

  it("resolves a canonical Project remote through the user session", async () => {
    cloudApi.getCloudRepositoryContext.mockResolvedValue({
      target: { kind: "project_root", project_id: "project-1" },
      project: { id: "project-1", name: "Notes", capabilities: ["content.read"] },
      scope_path: null,
    });
    const context = await render(
      <ContextHarness status={gitStatus({ fetch: "https://cloud.example/git/project-1.git" })} />,
    );
    expect(context).toMatchObject({
      projectId: "project-1",
      target: { kind: "project_root", project_id: "project-1" },
      hasCloudRemote: true,
      capabilities: ["content.read"],
      error: null,
    });
    expect(cloudApi.getCloudRepositoryContext).toHaveBeenCalledWith(
      session,
      "project-1",
      { kind: "project_root", project_id: "project-1" },
      expect.any(Function),
      session.api_base_url,
    );
  });

  it("resolves an exact Scope view without changing the owning Project", async () => {
    cloudApi.getCloudRepositoryContext.mockResolvedValue({
      target: { kind: "scope", project_id: "project-1", scope_id: "scope-docs" },
      project: { id: "project-1", name: "Notes", capabilities: ["content.read"] },
      scope_path: "docs",
    });
    const context = await render(
      <ContextHarness status={gitStatus({
        fetch: "https://cloud.example/git/project-1/scopes/scope-docs.git",
      })} />,
    );
    expect(context).toMatchObject({
      projectId: "project-1",
      target: { kind: "scope", project_id: "project-1", scope_id: "scope-docs" },
      scopePath: "docs",
    });
  });

  it("requires sign-in for a remote but still performs no request while signed out", async () => {
    const context = await render(
      <ContextHarness
        activeCloudSession={null}
        status={gitStatus({ fetch: "https://cloud.example/git/project-1.git" })}
      />,
    );
    expect(context).toMatchObject({
      projectId: null,
      candidateProjectId: "project-1",
      hasCloudRemote: true,
      reason: "wrong-account",
      error: { code: "remote-sign-in" },
    });
    expect(cloudApi.getCloudRepositoryContext).not.toHaveBeenCalled();
  });

  it("fails locally on a wrong host or conflicting locators", async () => {
    const wrongHost = await render(
      <ContextHarness status={gitStatus({ fetch: "https://other.example/git/project-1.git" })} />,
    );
    expect(wrongHost).toMatchObject({ reason: "wrong-host", error: { code: "remote-wrong-host" } });

    const conflict = await render(
      <ContextHarness status={gitStatus({
        fetch: "https://cloud.example/git/project-1.git",
        push: "https://cloud.example/git/project-2.git",
      })} />,
    );
    expect(conflict).toMatchObject({
      reason: "locator-conflict",
      error: { code: "remote-locator-conflict" },
    });
    expect(cloudApi.getCloudRepositoryContext).not.toHaveBeenCalled();
  });

  it("treats a legacy access-key remote as local-only Cloud context without an API request", async () => {
    const context = await render(
      <ContextHarness status={gitStatus({ fetch: "https://cloud.example/git/ap/pwg_secret.git" })} />,
    );
    expect(context).toMatchObject({
      projectId: null,
      hasCloudRemote: false,
      reason: null,
      error: null,
    });
    expect(cloudApi.getCloudRepositoryContext).not.toHaveBeenCalled();
  });

  it.each([
    [401, "wrong-account", "remote-sign-in"],
    [403, "not-authorized", "remote-not-authorized"],
    [404, "not-found", "remote-not-found"],
    [503, "network", "remote-network-failed"],
  ] as const)("maps HTTP %s without exposing raw transport state", async (statusCode, reason, code) => {
    const error = Object.assign(new Error("server detail"), { status: statusCode });
    cloudApi.getCloudRepositoryContext.mockRejectedValue(error);
    const context = await render(
      <ContextHarness status={gitStatus({ fetch: "https://cloud.example/git/project-1.git" })} />,
    );
    expect(context).toMatchObject({ reason, error: { code } });
  });

  it("does not render SESSION_CHANGED as a repository failure", async () => {
    cloudApi.getCloudRepositoryContext.mockRejectedValue(
      Object.assign(new Error("Cloud session changed while the request was in flight."), {
        code: "SESSION_CHANGED",
      }),
    );
    const context = await render(
      <ContextHarness status={gitStatus({ fetch: "https://cloud.example/git/project-1.git" })} />,
    );
    expect(context?.error).toBeNull();
    expect(context?.resolutionPending).toBe(true);
  });
});

describe("resolution input gating", () => {
  it("waits only for the initial Git snapshot, never for local config", () => {
    expect(shouldBlockWorkspaceCloudResolution({
      gitStatusError: null,
      gitStatusPath: null,
      workspacePath: "/tmp/notes",
    })).toBe(true);
    expect(shouldBlockWorkspaceCloudResolution({
      gitStatusError: null,
      gitStatusPath: "/tmp/notes",
      workspacePath: "/tmp/notes",
    })).toBe(false);
    expect(shouldBlockWorkspaceCloudResolution({
      gitStatusError: "not a repository",
      gitStatusPath: null,
      workspacePath: "/tmp/notes",
    })).toBe(false);
  });
});
