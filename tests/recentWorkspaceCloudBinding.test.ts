import { describe, expect, it, vi } from "vitest";
import type { Workspace } from "@puppyone/shared-ui";
import { resolveRecentWorkspaceCloudBinding } from "../src/features/cloud/workspace/cloudProjectResolution";

function recentWorkspace(overrides: Partial<Workspace> = {}) {
  const workspace: Workspace = {
    id: "local:workspace-1",
    name: "Workspace",
    path: "/workspace",
    status: "protected",
    cloudState: "local",
    workspaceInstanceId: "workspace-instance-1",
    ...overrides,
  };
  return { workspace, lastOpenedAt: null };
}

const baseArguments = {
  apiBaseUrl: "https://api.puppyone.ai/api/v1",
  onSessionChange: vi.fn(),
  projects: [],
  session: null,
};

describe("recent workspace Cloud binding", () => {
  it("uses main-owned explicit binding facts while signed out without probing the inactive folder", async () => {
    await expect(resolveRecentWorkspaceCloudBinding({
      ...baseArguments,
      item: recentWorkspace({
        cloudProjectId: "cloud-1",
        cloudBindingId: "binding-1",
        cloudBindingOrigin: "https://api.puppyone.ai",
        cloudBindingWorkspaceInstanceId: "workspace-instance-1",
      }),
    })).resolves.toEqual(["local:workspace-1", {
      projectId: "cloud-1",
      bindingId: "binding-1",
      cloudLinked: true,
      error: null,
      reason: null,
    }]);
  });

  it("rejects a cached binding for another host or local checkout before network access", async () => {
    await expect(resolveRecentWorkspaceCloudBinding({
      ...baseArguments,
      item: recentWorkspace({
        cloudProjectId: "cloud-1",
        cloudBindingId: "binding-1",
        cloudBindingOrigin: "https://other.puppyone.ai",
        cloudBindingWorkspaceInstanceId: "workspace-instance-1",
      }),
    })).resolves.toMatchObject(["local:workspace-1", {
      projectId: null,
      candidateProjectId: "cloud-1",
      reason: "wrong-host",
    }]);

    await expect(resolveRecentWorkspaceCloudBinding({
      ...baseArguments,
      item: recentWorkspace({
        cloudProjectId: "cloud-1",
        cloudBindingId: "binding-1",
        cloudBindingOrigin: "https://api.puppyone.ai",
        cloudBindingWorkspaceInstanceId: "another-workspace-instance",
      }),
    })).resolves.toMatchObject(["local:workspace-1", {
      projectId: null,
      candidateProjectId: "cloud-1",
      reason: "binding-revoked",
    }]);
  });

  it("surfaces legacy-remotes and invalid config from main-owned hydration hints", async () => {
    await expect(resolveRecentWorkspaceCloudBinding({
      ...baseArguments,
      item: recentWorkspace({ hasPuppyoneCloudRemote: true }),
    })).resolves.toMatchObject(["local:workspace-1", {
      projectId: null,
      cloudLinked: true,
      reason: "legacy-confirmation-required",
    }]);

    await expect(resolveRecentWorkspaceCloudBinding({
      ...baseArguments,
      item: recentWorkspace({ configError: "Config is invalid" }),
    })).resolves.toEqual(["local:workspace-1", {
      projectId: null,
      cloudLinked: false,
      error: {
        code: "binding-config-error",
        detail: "Config is invalid",
        values: undefined,
      },
      reason: null,
    }]);
  });
});
