import { describe, expect, it } from "vitest";
import { FEATURE_FLAG_DEFAULTS } from "../src/features/flags/registry";
import { resolveFeatureFlags } from "../src/features/flags/resolveFlags";
import {
  cloudContextHasProject,
  getResolvedCloudProjectId,
  resolveCloudHubSectionAfterContextChange,
  resolveCloudHubSectionForContext,
  resolveProjectCloudContext,
} from "../src/features/cloud/context/projectCloudContext";
import {
  getHomeProjectItems,
  getWorkspaceSwitcherItems,
} from "../src/features/app-shell/workspaceHomeModel";
import { isCloudWorkspace, createCloudWorkspace } from "../src/lib/cloudDataPort";
import type { RecentWorkspaceHomeItem } from "../src/components/MinimalOnboarding";
import type { Workspace } from "@puppyone/shared-ui";
import { cloudMessage } from "../src/features/cloud/cloudPresentation";
import { deriveCloudWorkspaceContext } from "../src/features/cloud/workspace/deriveCloudWorkspaceContext";

describe("cloud-only workspace feature", () => {
  it("defaults cloudOnlyWorkspace to false while keeping cloudWorkspace enabled", () => {
    expect(FEATURE_FLAG_DEFAULTS.cloudOnlyWorkspace).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.cloudWorkspace).toBe(true);
    expect(resolveFeatureFlags({}).cloudOnlyWorkspace).toBe(false);
  });

  it("merges a recent local repository with its remote-resolved Cloud Project", () => {
    const recentWorkspaceItems: RecentWorkspaceHomeItem[] = [{
      workspace: {
        id: "local-1",
        name: "Notes",
        path: "/Users/example/Notes",
      } as Workspace,
      lastOpenedAt: "2026-07-10T10:00:00.000Z",
    }];
    const items = getHomeProjectItems({
      contexts: {
        "local-1": {
          projectId: "cloud-notes",
          hasCloudRemote: true,
          error: null,
        },
      },
      cloudProjects: [
        { id: "cloud-notes", name: "Notes Cloud", description: null, updated_at: null },
        { id: "cloud-orphan", name: "Orphan Cloud", description: null, updated_at: null },
      ],
      includeUnboundCloudProjects: false,
      recentWorkspaceItems,
    });
    expect(items).toEqual([
      expect.objectContaining({
        kind: "cloud-local",
        localPath: "/Users/example/Notes",
        cloudProjectId: "cloud-notes",
        detail: "Notes Cloud",
      }),
    ]);
  });

  it("keeps a repository with no remote local even when Cloud projects exist", () => {
    const items = getHomeProjectItems({
      contexts: {
        local: { projectId: null, hasCloudRemote: false, error: null },
      },
      cloudProjects: [{ id: "cloud-1", name: "Cloud", description: null, updated_at: null }],
      includeUnboundCloudProjects: false,
      recentWorkspaceItems: [{
        workspace: { id: "local", name: "Local", path: "/tmp/local" } as Workspace,
        lastOpenedAt: null,
      }],
    });
    expect(items[0]).toMatchObject({ kind: "local", cloudProjectId: null });
  });

  it("hides pure Cloud projects from the switcher when includeCloud is false", () => {
    const items = getWorkspaceSwitcherItems({
      cloudProjects: [{ id: "cloud-only", name: "Cloud Only", description: null, updated_at: null }],
      includeCloud: false,
      workspaces: [
        { id: "local-1", name: "Local", path: "/Users/example/Local" } as Workspace,
        createCloudWorkspace({ id: "cloud-open", name: "Cloud", description: null, updated_at: null }),
      ],
    });
    expect(items.every((item) => item.kind === "local")).toBe(true);
  });

  it("still recognizes cloud:// Cloud-only workspaces", () => {
    const cloudWorkspace = createCloudWorkspace({
      id: "proj-1",
      name: "Hosted",
      description: null,
      updated_at: null,
    });
    expect(cloudWorkspace.path.startsWith("cloud://")).toBe(true);
    expect(isCloudWorkspace(cloudWorkspace)).toBe(true);
  });
});

describe("Project Cloud repository context", () => {
  it("is local-only when no PuppyOne Git remote exists", () => {
    expect(resolveProjectCloudContext({
      resolvedProjectId: null,
      remoteProjectId: null,
      contextError: null,
      hasCanonicalRemote: false,
      resolving: false,
    })).toEqual({ status: "local-only", projectId: null });
  });

  it("promotes only a resolved Project with an exact matching repository target", () => {
    const resolved = resolveProjectCloudContext({
      resolvedProjectId: "proj-1",
      remoteProjectId: null,
      contextError: null,
      hasCanonicalRemote: true,
      target: { kind: "project_root", project_id: "proj-1" },
      resolving: false,
    });
    expect(resolved).toEqual({
      status: "resolved",
      projectId: "proj-1",
      target: { kind: "project_root", project_id: "proj-1" },
    });
    expect(getResolvedCloudProjectId(resolved)).toBe("proj-1");
    expect(cloudContextHasProject(resolved)).toBe(true);
    expect(resolveCloudHubSectionForContext(resolved)).toBe("contents");

    expect(resolveProjectCloudContext({
      resolvedProjectId: "proj-1",
      remoteProjectId: null,
      contextError: null,
      hasCanonicalRemote: true,
      target: { kind: "project_root", project_id: "other" },
      resolving: false,
    })).toEqual({
      status: "unresolvable",
      projectId: null,
      message: cloudMessage("remote-unresolvable"),
    });
  });

  it("keeps authorization, network, and locator failures distinct", () => {
    expect(resolveProjectCloudContext({
      resolvedProjectId: null,
      remoteProjectId: "proj-secret",
      contextError: cloudMessage("remote-not-authorized"),
      contextReason: "not-authorized",
      hasCanonicalRemote: true,
      resolving: false,
    })).toEqual({
      status: "not-authorized",
      projectId: "proj-secret",
      message: cloudMessage("remote-not-authorized"),
    });

    expect(resolveProjectCloudContext({
      resolvedProjectId: null,
      remoteProjectId: "proj-temporary",
      contextError: cloudMessage("remote-network-failed"),
      contextReason: "network",
      hasCanonicalRemote: true,
      resolving: false,
    })).toEqual({
      status: "temporarily-unavailable",
      projectId: "proj-temporary",
      message: cloudMessage("remote-network-failed"),
    });
  });

  it("preserves explicit sections while a verified context remains active", () => {
    expect(resolveCloudHubSectionAfterContextChange({
      currentSection: "access",
      hasProjectContext: true,
      workspaceChanged: false,
    })).toBe("access");
    expect(resolveCloudHubSectionAfterContextChange({
      currentSection: "projects",
      hasProjectContext: true,
      workspaceChanged: false,
    })).toBe("projects");
    expect(resolveCloudHubSectionAfterContextChange({
      currentSection: "initialize",
      hasProjectContext: true,
      workspaceChanged: false,
    })).toBe("initialize");
    expect(resolveCloudHubSectionAfterContextChange({
      currentSection: "claude",
      hasProjectContext: false,
      workspaceChanged: false,
    })).toBe("initialize");
  });
});

describe("workspace-context derivation", () => {
  it("never derives a Cloud Project from an explicit global route", () => {
    expect(deriveCloudWorkspaceContext({
      cloudRemote: null,
      projectId: null,
      loading: false,
      error: null,
    })).toEqual({ status: "local-only" });
  });

  it("reports an exact remote-resolved Project", () => {
    expect(deriveCloudWorkspaceContext({
      cloudRemote: { name: "puppyone", rawUrl: "https://cloud.example/git/proj-1.git" } as never,
      projectId: "proj-1",
      loading: false,
      error: null,
    })).toEqual({ status: "resolved", projectId: "proj-1" });
  });
});
