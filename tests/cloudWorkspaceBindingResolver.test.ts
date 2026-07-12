import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "@puppyone/shared-ui";
import type { DesktopCloudProject, DesktopCloudSession } from "../src/lib/cloudApi";
import {
  bindingMatchesWorkspace,
  bindingCredentialRemoteUrl,
  createExplicitWorkspaceBinding,
} from "../src/features/cloud/workspace/explicitWorkspaceBinding";
import {
  resolveCloudProjectNavigationContext,
  resolveProjectCloudAttachment,
} from "../src/features/cloud/attachment/projectCloudAttachment";

const getCloudProject = vi.fn();
const createCloudWorkspaceBinding = vi.fn();
const rotateCloudWorkspaceBindingCredential = vi.fn();

vi.mock("../src/lib/cloudApi", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/cloudApi")>("../src/lib/cloudApi");
  return {
    ...actual,
    getCloudProject: (...args: unknown[]) => getCloudProject(...args),
    createCloudWorkspaceBinding: (...args: unknown[]) => createCloudWorkspaceBinding(...args),
    rotateCloudWorkspaceBindingCredential: (...args: unknown[]) => rotateCloudWorkspaceBindingCredential(...args),
  };
});

const session = {
  user_id: "user-1",
  user_email: "dev@example.com",
  api_base_url: "https://cloud.example/api/v1",
  session_generation: "generation-1",
} as DesktopCloudSession;

const workspace = {
  id: "local:workspace-1",
  name: "Notes",
  path: "/tmp/notes",
  workspaceInstanceId: "workspace-instance-0001",
} as Workspace;

function binding(overrides: Record<string, unknown> = {}) {
  return {
    id: "binding-1",
    org_id: "org-1",
    project_id: "project-1",
    scope_id: "scope-root",
    workspace_instance_id: "workspace-instance-0001",
    bound_user_id: "user-1",
    cloud_origin: "https://cloud.example",
    binding_kind: "full",
    mode: "rw",
    status: "active",
    usable: true,
    created_at: "2026-07-12T00:00:00Z",
    updated_at: "2026-07-12T00:00:00Z",
    last_seen_at: "2026-07-12T00:00:00Z",
    credential: "binding_secret",
    ...overrides,
  };
}

describe("explicit workspace binding", () => {
  beforeEach(() => {
    getCloudProject.mockReset();
    createCloudWorkspaceBinding.mockReset();
    rotateCloudWorkspaceBindingCredential.mockReset();
  });

  it("replaces only the Access credential segment and strips URL credentials/query state", () => {
    expect(bindingCredentialRemoteUrl(
      "https://user:password@cloud.example/git/ap/legacy.git?token=old#fragment",
      "new token",
    )).toBe("https://cloud.example/git/ap/new%20token.git");
  });

  it("fails closed when stable local workspace identity is absent or mismatched", () => {
    expect(bindingMatchesWorkspace({
      binding: binding(),
      workspace: { ...workspace, workspaceInstanceId: undefined },
      configuredProjectId: "project-1",
      configuredOrigin: "https://cloud.example",
    })).toBe(false);
    expect(bindingMatchesWorkspace({
      binding: binding(),
      workspace: { ...workspace, workspaceInstanceId: "workspace-instance-other" },
      configuredProjectId: "project-1",
      configuredOrigin: "https://cloud.example",
    })).toBe(false);
  });

  it("creates a full binding without accepting a client-selected root scope", async () => {
    const project: DesktopCloudProject = {
      id: "project-1",
      name: "Notes",
      capabilities: ["workspace.bind.readwrite"],
    };
    createCloudWorkspaceBinding.mockResolvedValue(binding());

    const result = await createExplicitWorkspaceBinding({
      session,
      apiBaseUrl: session.api_base_url,
      project,
      projectId: project.id,
      workspace,
      remoteUrl: "https://cloud.example/git/ap/legacy.git",
      onSessionChange: vi.fn(),
    });

    expect(createCloudWorkspaceBinding).toHaveBeenCalledWith(
      session,
      "project-1",
      expect.objectContaining({
        binding_kind: "full",
        scope_id: null,
        mode: "rw",
        workspace_instance_id: "workspace-instance-0001",
      }),
      expect.any(Function),
      session.api_base_url,
    );
    expect(result.credentialRemoteUrl).toBe("https://cloud.example/git/ap/binding_secret.git");
  });

  it("requires an explicit scope for scoped legacy confirmation and clamps Viewer to read-only", async () => {
    const project: DesktopCloudProject = {
      id: "project-1",
      name: "Notes",
      capabilities: ["workspace.bind.readonly"],
    };
    await expect(createExplicitWorkspaceBinding({
      session,
      apiBaseUrl: session.api_base_url,
      project,
      projectId: project.id,
      workspace,
      remoteUrl: "https://cloud.example/git/ap/legacy.git",
      bindingKind: "scoped",
      scopeId: null,
      onSessionChange: vi.fn(),
    })).rejects.toThrow("requires an explicit Cloud scope");

    createCloudWorkspaceBinding.mockResolvedValue(binding({
      scope_id: "scope-docs",
      scope_path: "/docs",
      binding_kind: "scoped",
      mode: "r",
    }));
    await createExplicitWorkspaceBinding({
      session,
      apiBaseUrl: session.api_base_url,
      project,
      projectId: project.id,
      workspace,
      remoteUrl: "https://cloud.example/git/ap/legacy.git",
      bindingKind: "scoped",
      scopeId: "scope-docs",
      onSessionChange: vi.fn(),
    });
    expect(createCloudWorkspaceBinding).toHaveBeenCalledWith(
      session,
      "project-1",
      expect.objectContaining({ binding_kind: "scoped", scope_id: "scope-docs", mode: "r" }),
      expect.any(Function),
      session.api_base_url,
    );
  });

  it("rotates only this binding when an idempotent create does not return plaintext", async () => {
    createCloudWorkspaceBinding.mockResolvedValue(binding({ credential: null }));
    rotateCloudWorkspaceBindingCredential.mockResolvedValue("rotated_secret");
    await createExplicitWorkspaceBinding({
      session,
      apiBaseUrl: session.api_base_url,
      project: { id: "project-1", name: "Notes", capabilities: ["workspace.bind.readonly"] },
      projectId: "project-1",
      workspace,
      remoteUrl: "https://cloud.example/git/ap/legacy.git",
      onSessionChange: vi.fn(),
    });
    expect(rotateCloudWorkspaceBindingCredential).toHaveBeenCalledWith(
      session, "binding-1", expect.any(Function), session.api_base_url,
    );
  });
});

describe("binding-only attachment semantics", () => {
  it("requires confirmation for a legacy candidate and never promotes it to linked", () => {
    const attachment = resolveProjectCloudAttachment({
      configuredProjectId: null,
      bindingProjectId: null,
      remoteProjectId: "project-1",
      bindingError: "Confirm this project.",
      bindingReason: "legacy-confirmation-required",
      bindingCloudLinked: true,
      bindingKind: "scoped",
      scopeId: "scope-docs",
      resolving: false,
    });
    expect(attachment).toEqual({
      status: "legacy-confirmation-required",
      projectId: "project-1",
      scopeId: "scope-docs",
      bindingKind: "scoped",
      message: "Confirm this project.",
    });
    expect(resolveCloudProjectNavigationContext(attachment, "stale")).toEqual({
      projectContext: false,
      projectBound: false,
    });
  });

  it("keeps a verified binding linked on a transient network warning", () => {
    const attachment = resolveProjectCloudAttachment({
      configuredProjectId: null,
      bindingProjectId: "project-1",
      remoteProjectId: null,
      bindingError: "Network offline",
      bindingReason: "network",
      bindingCloudLinked: true,
      bindingId: "binding-1",
      resolving: false,
    });
    expect(attachment).toEqual({
      status: "linked",
      projectId: "project-1",
      bindingId: "binding-1",
      warning: "Network offline",
    });
  });
});
