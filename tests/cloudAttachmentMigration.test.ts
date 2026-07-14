import { describe, expect, it } from "vitest";
import { FEATURE_FLAG_DEFAULTS } from "../src/features/flags/registry";
import { resolveFeatureFlags } from "../src/features/flags/resolveFlags";
import {
  attachmentHasBoundProject,
  attachmentHasProjectContext,
  getAttachedCloudProjectId,
  getResolvedCloudProjectId,
  isProjectCloudLinked,
  resolveCloudHubSectionForAttachment,
  resolveProjectCloudAttachment,
} from "../src/features/cloud/attachment/projectCloudAttachment";
import {
  getHomeProjectItems,
  getWorkspaceSwitcherItems,
} from "../src/features/app-shell/workspaceHomeModel";
import { isCloudWorkspace, createCloudWorkspace } from "../src/lib/cloudDataPort";
import type { RecentWorkspaceHomeItem } from "../src/components/MinimalOnboarding";
import type { Workspace } from "@puppyone/shared-ui";
import { cloudMessage } from "../src/features/cloud/cloudPresentation";

describe("cloudOnlyWorkspace migration", () => {
  it("defaults cloudOnlyWorkspace to false while keeping cloudWorkspace enabled", () => {
    expect(FEATURE_FLAG_DEFAULTS.cloudOnlyWorkspace).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.cloudWorkspace).toBe(true);
    expect(resolveFeatureFlags({}).cloudOnlyWorkspace).toBe(false);
  });

  it("hides unbound Cloud projects from the homepage when cloud-only entry is off", () => {
    const recentWorkspaceItems: RecentWorkspaceHomeItem[] = [
      {
        workspace: {
          id: "local-1",
          name: "Notes",
          path: "/Users/example/Notes",
        } as Workspace,
        lastOpenedAt: "2026-07-10T10:00:00.000Z",
      },
    ];

    const items = getHomeProjectItems({
      bindings: {
        "local-1": {
          projectId: "cloud-notes",
          cloudLinked: true,
          error: null,
        },
      },
      cloudProjects: [
        {
          id: "cloud-notes",
          name: "Notes Cloud",
          description: null,
          updated_at: "2026-07-09T10:00:00.000Z",
        },
        {
          id: "cloud-orphan",
          name: "Orphan Cloud",
          description: null,
          updated_at: "2026-07-08T10:00:00.000Z",
        },
      ],
      includeUnboundCloudProjects: false,
      recentWorkspaceItems,
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("cloud-local");
    expect(items[0]?.cloudProjectId).toBe("cloud-notes");
    expect(items.some((item) => item.kind === "cloud")).toBe(false);
  });

  it("keeps Local + Cloud merged as one homepage project", () => {
    const items = getHomeProjectItems({
      bindings: {
        "local-brand": {
          projectId: "cloud-brand",
          cloudLinked: true,
          error: null,
        },
      },
      cloudProjects: [
        {
          id: "cloud-brand",
          name: "Brand System",
          description: null,
          updated_at: "2026-07-09T10:00:00.000Z",
        },
      ],
      includeUnboundCloudProjects: false,
      recentWorkspaceItems: [
        {
          workspace: {
            id: "local-brand",
            name: "brand-system",
            path: "/Users/example/brand-system",
          } as Workspace,
          lastOpenedAt: "2026-07-09T10:00:00.000Z",
        },
      ],
    });

    expect(items).toEqual([
      expect.objectContaining({
        kind: "cloud-local",
        localPath: "/Users/example/brand-system",
        cloudProjectId: "cloud-brand",
        detail: "Brand System",
      }),
    ]);
  });

  it("hides pure Cloud projects from the workspace switcher when includeCloud is false", () => {
    const items = getWorkspaceSwitcherItems({
      cloudProjects: [
        {
          id: "cloud-only",
          name: "Cloud Only",
          description: null,
          updated_at: null,
        },
      ],
      includeCloud: false,
      workspaces: [
        {
          id: "local-1",
          name: "Local",
          path: "/Users/example/Local",
        } as Workspace,
        createCloudWorkspace({
          id: "cloud-open",
          name: "Already Open Cloud",
          description: null,
          updated_at: null,
        }),
      ],
    });

    expect(items.every((item) => item.kind === "local")).toBe(true);
    expect(items.some((item) => item.kind === "cloud")).toBe(false);
  });

  it("still recognizes cloud:// Cloud-only workspaces", () => {
    const workspace = createCloudWorkspace({
      id: "proj-1",
      name: "Hosted",
      description: null,
      updated_at: null,
    });
    expect(workspace.path.startsWith("cloud://")).toBe(true);
    expect(isCloudWorkspace(workspace)).toBe(true);
  });
});

describe("ProjectCloudAttachment", () => {
  it("resolves binding state without using CloudAuth / session availability", () => {
    expect(resolveProjectCloudAttachment({
      resolvedProjectId: "proj-1",
      remoteProjectId: null,
      bindingError: null,
      bindingCloudLinked: false,
      resolutionSource: "workspace-binding",
      bindingStatus: "bound",
      resolving: false,
    })).toEqual({
      status: "resolved",
      projectId: "proj-1",
      resolutionSource: "workspace-binding",
      bindingStatus: "bound",
    });

    expect(resolveProjectCloudAttachment({
      resolvedProjectId: "proj-1",
      remoteProjectId: null,
      bindingError: null,
      bindingCloudLinked: true,
      resolutionSource: "workspace-binding",
      bindingStatus: "bound",
      resolving: false,
    })).toEqual({
      status: "resolved",
      projectId: "proj-1",
      resolutionSource: "workspace-binding",
      bindingStatus: "bound",
    });

    expect(resolveProjectCloudAttachment({
      resolvedProjectId: null,
      remoteProjectId: null,
      bindingError: null,
      bindingCloudLinked: false,
      resolving: false,
    })).toEqual({ status: "local-only", projectId: null });
  });

  it("does not promote a Project ID without resolver provenance", () => {
    expect(resolveProjectCloudAttachment({
      resolvedProjectId: "unverified-project",
      remoteProjectId: null,
      bindingError: null,
      bindingCloudLinked: false,
      resolutionSource: null,
      bindingStatus: null,
      resolving: false,
    })).toEqual({ status: "local-only", projectId: null });
  });

  it("separates an authorized canonical context from a durable binding", () => {
    const context = resolveProjectCloudAttachment({
      resolvedProjectId: "proj-canonical",
      remoteProjectId: null,
      bindingError: null,
      bindingCloudLinked: true,
      resolutionSource: "canonical-remote",
      bindingStatus: "not-bound",
      bindingKind: "scoped",
      scopeId: "scope-docs",
      resolving: false,
    });

    expect(getResolvedCloudProjectId(context)).toBe("proj-canonical");
    expect(attachmentHasProjectContext(context)).toBe(true);
    expect(getAttachedCloudProjectId(context)).toBeNull();
    expect(attachmentHasBoundProject(context)).toBe(false);
    expect(isProjectCloudLinked(context)).toBe(false);
    expect(resolveCloudHubSectionForAttachment(context)).toBe("contents");
  });

  it("exposes helpers for attached project ids and hub section resets", () => {
    const linked = resolveProjectCloudAttachment({
      resolvedProjectId: "proj-2",
      remoteProjectId: null,
      bindingError: null,
      bindingCloudLinked: true,
      resolutionSource: "workspace-binding",
      bindingStatus: "bound",
      resolving: false,
    });
    expect(getAttachedCloudProjectId(linked)).toBe("proj-2");
    expect(isProjectCloudLinked(linked)).toBe(true);
    expect(attachmentHasBoundProject(linked)).toBe(true);
    expect(isProjectCloudLinked({ status: "local-only", projectId: null })).toBe(false);
    expect(resolveCloudHubSectionForAttachment(linked)).toBe("contents");
    expect(resolveCloudHubSectionForAttachment({ status: "local-only", projectId: null })).toBe("overview");
  });

  it("separates not-authorized and unresolvable recovery attachments", () => {
    expect(resolveProjectCloudAttachment({
      resolvedProjectId: null,
      remoteProjectId: "proj-secret",
      bindingError: cloudMessage("binding-not-authorized"),
      bindingReason: "not-authorized",
      bindingCloudLinked: true,
      resolving: false,
    })).toEqual({
      status: "not-authorized",
      projectId: "proj-secret",
      message: cloudMessage("binding-not-authorized"),
    });

    expect(resolveProjectCloudAttachment({
      resolvedProjectId: null,
      remoteProjectId: null,
      bindingError: cloudMessage("binding-unknown-remote"),
      bindingReason: "unresolvable",
      bindingCloudLinked: true,
      resolving: false,
    })).toEqual({
      status: "unresolvable",
      projectId: null,
      message: cloudMessage("binding-unknown-remote"),
    });

    expect(resolveProjectCloudAttachment({
      resolvedProjectId: null,
      remoteProjectId: "proj-temporary",
      bindingError: cloudMessage("binding-network-failed"),
      bindingReason: "network",
      bindingCloudLinked: true,
      resolving: false,
    })).toEqual({
      status: "temporarily-unavailable",
      projectId: "proj-temporary",
      message: cloudMessage("binding-network-failed"),
    });
  });
});

describe("explicit route vs mapped Cloud project binding", () => {
  it("does not treat an explicit global Project route as a mapped workspace binding", async () => {
    const { deriveCloudWorkspaceBinding } = await import("../src/features/cloud/workspace/deriveCloudWorkspaceBinding");
    const explicitRouteProjectId = "route-proj";
    const mappedProjectId = null;

    const binding = deriveCloudWorkspaceBinding({
      cloudRemote: null,
      projectId: mappedProjectId,
      loading: false,
      error: null,
    });

    expect(explicitRouteProjectId).toBe("route-proj");
    expect(binding).toEqual({ status: "local-only" });
    expect(isProjectCloudLinked({ status: "local-only", projectId: null })).toBe(false);
  });

  it("becomes mapped only after Attach sets mappedProjectId", async () => {
    const { deriveCloudWorkspaceBinding } = await import("../src/features/cloud/workspace/deriveCloudWorkspaceBinding");

    const beforeAttach = deriveCloudWorkspaceBinding({
      cloudRemote: null,
      projectId: null,
      loading: false,
      error: null,
    });
    expect(beforeAttach).toEqual({ status: "local-only" });

    const afterAttach = deriveCloudWorkspaceBinding({
      cloudRemote: {
        name: "puppyone",
        rawUrl: "https://cloud.example/git/proj-1.git",
        projectId: "proj-1",
      } as never,
      projectId: "proj-1",
      loading: false,
      error: null,
    });
    expect(afterAttach).toEqual({ status: "bound-full", projectId: "proj-1", readiness: null });
    expect(isProjectCloudLinked({
      status: "resolved",
      projectId: "proj-1",
      resolutionSource: "workspace-binding",
      bindingStatus: "bound",
    })).toBe(true);
  });
});
