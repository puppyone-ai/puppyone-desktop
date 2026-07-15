import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "@puppyone/shared-ui";
import type { DesktopCloudSession } from "../src/lib/cloudApi";

const cloudApi = vi.hoisted(() => ({
  getCloudProjectReadiness: vi.fn(),
  getCloudRepositoryContext: vi.fn(),
}));

vi.mock("../src/lib/cloudApi", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/cloudApi")>("../src/lib/cloudApi");
  return { ...actual, ...cloudApi };
});

import { resolveRecentWorkspaceCloudContext } from "../src/features/cloud/workspace/cloudProjectResolution";

function recentWorkspace(overrides: Partial<Workspace> = {}) {
  const workspace: Workspace = {
    id: "local:workspace-1",
    name: "Workspace",
    path: "/workspace",
    status: "protected",
    cloudState: "local",
    workspaceInstanceId: "local-registry-only",
    ...overrides,
  };
  return { workspace, lastOpenedAt: null };
}

const session = {
  user_id: "user-1",
  user_email: "dev@example.com",
  api_base_url: "https://api.puppyone.ai/api/v1",
  session_generation: "generation-1",
} as DesktopCloudSession;

const baseArguments = {
  apiBaseUrl: session.api_base_url,
  onSessionChange: vi.fn(),
  projects: [],
};

beforeEach(() => {
  cloudApi.getCloudProjectReadiness.mockReset();
  cloudApi.getCloudRepositoryContext.mockReset();
});

describe("recent workspace Cloud repository context", () => {
  it("keeps a workspace without a PuppyOne remote local-only and performs no request", async () => {
    await expect(resolveRecentWorkspaceCloudContext({
      ...baseArguments,
      item: recentWorkspace(),
      session,
    })).resolves.toEqual(["local:workspace-1", {
      projectId: null,
      hasCloudRemote: false,
      error: null,
      reason: null,
    }]);
    expect(cloudApi.getCloudRepositoryContext).not.toHaveBeenCalled();
  });

  it("uses only the main-owned secret-free Git locator hint", async () => {
    cloudApi.getCloudRepositoryContext.mockResolvedValue({
      target: { kind: "project_root", project_id: "project-1" },
      project: { id: "project-1", name: "Notes", capabilities: ["content.read"] },
      scope_path: null,
    });
    cloudApi.getCloudProjectReadiness.mockResolvedValue({ git: { status: "ready" } });

    await expect(resolveRecentWorkspaceCloudContext({
      ...baseArguments,
      item: recentWorkspace({
        puppyoneGitRemote: {
          origin: "https://api.puppyone.ai",
          projectId: "project-1",
          scopeId: null,
        },
      }),
      session,
    })).resolves.toMatchObject(["local:workspace-1", {
      projectId: "project-1",
      target: { kind: "project_root", project_id: "project-1" },
      hasCloudRemote: true,
      capabilities: ["content.read"],
      error: null,
    }]);
    expect(cloudApi.getCloudRepositoryContext).toHaveBeenCalledWith(
      session,
      "project-1",
      { kind: "project_root", project_id: "project-1" },
      expect.any(Function),
      session.api_base_url,
    );
  });

  it("requires sign-in or the configured Cloud host before making a request", async () => {
    await expect(resolveRecentWorkspaceCloudContext({
      ...baseArguments,
      item: recentWorkspace({
        puppyoneGitRemote: { origin: "https://api.puppyone.ai", projectId: "project-1" },
      }),
      session: null,
    })).resolves.toMatchObject(["local:workspace-1", {
      projectId: null,
      candidateProjectId: "project-1",
      reason: "wrong-account",
      error: { code: "remote-sign-in" },
    }]);

    await expect(resolveRecentWorkspaceCloudContext({
      ...baseArguments,
      item: recentWorkspace({
        puppyoneGitRemote: { origin: "https://other.example", projectId: "project-1" },
      }),
      session,
    })).resolves.toMatchObject(["local:workspace-1", {
      projectId: null,
      candidateProjectId: "project-1",
      reason: "wrong-host",
    }]);
    expect(cloudApi.getCloudRepositoryContext).not.toHaveBeenCalled();
  });

  it("keeps a recent workspace without a canonical locator local-only", async () => {
    await expect(resolveRecentWorkspaceCloudContext({
      ...baseArguments,
      item: recentWorkspace({ puppyoneGitRemote: null }),
      session,
    })).resolves.toMatchObject(["local:workspace-1", {
      projectId: null,
      hasCloudRemote: false,
      reason: null,
      error: null,
    }]);
    expect(cloudApi.getCloudRepositoryContext).not.toHaveBeenCalled();
  });

  it("does not use workspace-instance identity as Cloud authority", async () => {
    const item = recentWorkspace({
      workspaceInstanceId: "arbitrary-local-value",
      puppyoneGitRemote: { origin: "https://api.puppyone.ai", projectId: "project-1" },
    });
    cloudApi.getCloudRepositoryContext.mockRejectedValue(
      Object.assign(new Error("forbidden"), { status: 403 }),
    );
    await expect(resolveRecentWorkspaceCloudContext({
      ...baseArguments,
      item,
      session,
    })).resolves.toMatchObject(["local:workspace-1", {
      reason: "not-authorized",
      error: { code: "remote-not-authorized" },
    }]);
  });
});
