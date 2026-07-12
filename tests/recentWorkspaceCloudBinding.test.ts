import { describe, expect, it } from "vitest";
import type { Workspace } from "@puppyone/shared-ui";
import { resolveRecentWorkspaceCloudBinding } from "../src/features/cloud/workspace/cloudProjectResolution";

function recentWorkspace(cloudProjectId: string | null, configError?: string) {
  const workspace: Workspace = {
    id: "local:workspace-1",
    name: "Workspace",
    path: "/workspace",
    status: "protected",
    cloudState: "local",
    cloudProjectId,
    ...(configError ? { configError } : {}),
  };
  return { workspace, lastOpenedAt: null };
}

describe("recent workspace Cloud binding", () => {
  it("uses the main-owned config hint while signed out without probing the inactive folder", async () => {
    await expect(resolveRecentWorkspaceCloudBinding({
      item: recentWorkspace("cloud-1"),
      projects: [],
      session: null,
    })).resolves.toEqual(["local:workspace-1", {
      projectId: "cloud-1",
      cloudLinked: true,
      error: null,
      reason: null,
    }]);
  });

  it("verifies the cached id against accessible projects when signed in", async () => {
    const session = { accessToken: "token", refreshToken: "refresh" } as never;
    await expect(resolveRecentWorkspaceCloudBinding({
      item: recentWorkspace("cloud-1"),
      projects: [{ id: "cloud-1", name: "Workspace" } as never],
      session,
    })).resolves.toEqual(["local:workspace-1", {
      projectId: "cloud-1",
      cloudLinked: true,
      error: null,
      reason: null,
    }]);

    await expect(resolveRecentWorkspaceCloudBinding({
      item: recentWorkspace("cloud-private"),
      projects: [{ id: "cloud-1", name: "Workspace" } as never],
      session,
    })).resolves.toMatchObject(["local:workspace-1", {
      projectId: null,
      cloudLinked: true,
      reason: "not-authorized",
    }]);
  });

  it("keeps invalid inactive config visible without attempting workspace IPC", async () => {
    await expect(resolveRecentWorkspaceCloudBinding({
      item: recentWorkspace(null, "Config is invalid"),
      projects: [],
      session: null,
    })).resolves.toEqual(["local:workspace-1", {
      projectId: null,
      cloudLinked: false,
      error: "Config is invalid",
      reason: null,
    }]);
  });
});
