import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopCloudProject, DesktopCloudSession } from "../src/lib/cloudApi";
import type { GitStatusSnapshot } from "../src/types/electron";
import { resolveMappedCloudProjectId } from "../src/features/cloud/workspace/resolveMappedCloudProjectId";
import {
  CLOUD_PROJECT_NOT_AUTHORIZED_MESSAGE,
  CLOUD_PROJECT_UNRESOLVABLE_MESSAGE,
  resolveWorkspaceCloudProjectBinding,
} from "../src/features/cloud/workspace/cloudProjectResolution";
import {
  resolveCloudProjectNavigationContext,
  resolveProjectCloudAttachment,
} from "../src/features/cloud/attachment/projectCloudAttachment";

const getCloudAccessPointSemantics = vi.fn();
const listCloudScopes = vi.fn();
const getCloudRepoIdentity = vi.fn();

vi.mock("../src/lib/cloudApi", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/cloudApi")>("../src/lib/cloudApi");
  return {
    ...actual,
    getCloudAccessPointSemantics: (...args: unknown[]) => getCloudAccessPointSemantics(...args),
    listCloudScopes: (...args: unknown[]) => listCloudScopes(...args),
    getCloudRepoIdentity: (...args: unknown[]) => getCloudRepoIdentity(...args),
  };
});

const session = {
  user_id: "user-1",
  user_email: "dev@example.com",
  api_base_url: "https://cloud.example",
  session_generation: 1,
} as DesktopCloudSession;

const accessibleProjects: DesktopCloudProject[] = [
  { id: "proj-accessible", name: "Notes" },
  { id: "proj-other", name: "Other" },
];

function statusWithRemote(rawUrl: string): GitStatusSnapshot {
  return {
    remotes: [{
      name: "puppyone",
      fetchUrl: rawUrl,
      pushUrl: rawUrl,
      branches: [],
    }],
  } as GitStatusSnapshot;
}

describe("Cloud workspace binding resolver", () => {
  beforeEach(() => {
    getCloudAccessPointSemantics.mockReset();
    listCloudScopes.mockReset();
    getCloudRepoIdentity.mockReset();
  });

  it("maps a non-root Access Point scope to its owning accessible project", async () => {
    getCloudAccessPointSemantics.mockResolvedValue({
      project_id: "proj-accessible",
      scope: {
        project_id: "proj-accessible",
        path: "/docs",
        is_root: false,
      },
    });

    const projectId = await resolveMappedCloudProjectId({
      session,
      projects: accessibleProjects,
      cloudRemote: {
        remote: { name: "puppyone", fetchUrl: "", pushUrl: "", branches: [] },
        rawUrl: "https://cloud.example/git/ap/ap_key.git",
        info: {
          kind: "access-point",
          host: "cloud.example",
          displayId: "ap_…",
          accessKey: "ap_key",
        },
      },
      configuredProjectId: null,
      onSessionChange: vi.fn(),
      cloudApiBaseUrl: "https://cloud.example",
    });

    expect(projectId).toBe("proj-accessible");
    expect(getCloudAccessPointSemantics).toHaveBeenCalled();
  });

  it("binds /git/<projectId>.git only when the project is accessible", async () => {
    const mapped = await resolveWorkspaceCloudProjectBinding({
      activeGitStatus: statusWithRemote("https://cloud.example/git/proj-accessible.git"),
      apiBaseUrl: "https://cloud.example",
      configuredProjectId: null,
      onSessionChange: vi.fn(),
      projects: accessibleProjects,
      session,
      workspace: { id: "ws", name: "Notes", path: "/tmp/notes" } as never,
    });
    expect(mapped).toEqual({ status: "mapped", projectId: "proj-accessible" });

    const denied = await resolveWorkspaceCloudProjectBinding({
      activeGitStatus: statusWithRemote("https://cloud.example/git/proj-secret.git"),
      apiBaseUrl: "https://cloud.example",
      configuredProjectId: null,
      onSessionChange: vi.fn(),
      projects: accessibleProjects,
      session,
      workspace: { id: "ws", name: "Notes", path: "/tmp/notes" } as never,
    });
    expect(denied).toEqual({
      status: "not-authorized",
      candidateProjectId: "proj-secret",
      message: CLOUD_PROJECT_NOT_AUTHORIZED_MESSAGE,
    });
  });

  it("does not trust configured ids that are missing from accessible projects", async () => {
    const resolution = await resolveWorkspaceCloudProjectBinding({
      activeGitStatus: statusWithRemote("https://cloud.example/git/proj-secret.git"),
      apiBaseUrl: "https://cloud.example",
      configuredProjectId: "proj-secret",
      onSessionChange: vi.fn(),
      projects: accessibleProjects,
      session,
      workspace: { id: "ws", name: "Notes", path: "/tmp/notes" } as never,
    });
    expect(resolution.status).toBe("not-authorized");
  });

  it("returns unresolvable when a remote exists but no project identity can be proven", async () => {
    getCloudAccessPointSemantics.mockRejectedValue(new Error("unsupported"));
    listCloudScopes.mockResolvedValue([]);
    getCloudRepoIdentity.mockRejectedValue(new Error("missing"));

    const resolution = await resolveWorkspaceCloudProjectBinding({
      activeGitStatus: statusWithRemote("https://cloud.example/git/ap/unknown.git"),
      apiBaseUrl: "https://cloud.example",
      configuredProjectId: null,
      onSessionChange: vi.fn(),
      projects: accessibleProjects,
      session,
      workspace: { id: "ws", name: "Notes", path: "/tmp/notes" } as never,
    });
    expect(resolution).toEqual({
      status: "unresolvable",
      message: CLOUD_PROJECT_UNRESOLVABLE_MESSAGE,
    });
  });

  it("keeps verified bindings linked with a warning on network-style errors", () => {
    const attachment = resolveProjectCloudAttachment({
      configuredProjectId: "proj-accessible",
      bindingProjectId: null,
      remoteProjectId: null,
      bindingError: "Network offline",
      bindingReason: "network",
      bindingCloudLinked: true,
      resolving: false,
    });
    expect(attachment).toEqual({
      status: "linked",
      projectId: "proj-accessible",
      warning: "Network offline",
    });
    expect(resolveCloudProjectNavigationContext(attachment, "stale-browse").projectBound).toBe(true);
  });

  it("does not let a stale selectedProjectId override a formal binding or invent context on recovery", () => {
    const linked = resolveProjectCloudAttachment({
      configuredProjectId: "proj-accessible",
      bindingProjectId: null,
      remoteProjectId: null,
      bindingError: null,
      bindingCloudLinked: true,
      resolving: false,
    });
    expect(resolveCloudProjectNavigationContext(linked, "other-proj")).toEqual({
      projectContext: true,
      projectBound: true,
    });

    const recovery = resolveProjectCloudAttachment({
      configuredProjectId: null,
      bindingProjectId: null,
      remoteProjectId: "proj-secret",
      bindingError: CLOUD_PROJECT_NOT_AUTHORIZED_MESSAGE,
      bindingReason: "not-authorized",
      bindingCloudLinked: true,
      resolving: false,
    });
    expect(recovery.status).toBe("not-authorized");
    expect(resolveCloudProjectNavigationContext(recovery, "other-proj")).toEqual({
      projectContext: false,
      projectBound: false,
    });
  });
});
