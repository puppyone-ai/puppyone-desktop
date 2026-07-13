import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { Workspace } from "@puppyone/shared-ui";
import type { DesktopCloudProject, DesktopCloudSession } from "../src/lib/cloudApi";
import {
  bindingMatchesWorkspace,
  createExplicitWorkspaceBinding,
} from "../src/features/cloud/workspace/explicitWorkspaceBinding";
import {
  resolveCloudProjectNavigationContext,
  resolveProjectCloudAttachment,
} from "../src/features/cloud/attachment/projectCloudAttachment";
import { parsePuppyoneRemote } from "../src/features/source-control/remotes";
import { shouldLoadCloudProjectCatalog } from "../src/features/cloud/workspace/cloudProjectResolution";
import { cloudMessage } from "../src/features/cloud/cloudPresentation";

const getCloudProject = vi.fn();
const createCloudWorkspaceBinding = vi.fn();
const rotateCloudWorkspaceBindingCredential = vi.fn();
const revokeCloudWorkspaceBinding = vi.fn();
const revokeCloudWorkspaceBindingCredential = vi.fn();

vi.mock("../src/lib/cloudApi", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/cloudApi")>("../src/lib/cloudApi");
  return {
    ...actual,
    getCloudProject: (...args: unknown[]) => getCloudProject(...args),
    createCloudWorkspaceBinding: (...args: unknown[]) => createCloudWorkspaceBinding(...args),
    rotateCloudWorkspaceBindingCredential: (...args: unknown[]) => rotateCloudWorkspaceBindingCredential(...args),
    revokeCloudWorkspaceBinding: (...args: unknown[]) => revokeCloudWorkspaceBinding(...args),
    revokeCloudWorkspaceBindingCredential: (...args: unknown[]) => revokeCloudWorkspaceBindingCredential(...args),
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

describe("binding-first Project catalog policy", () => {
  it("does not scan the Organization catalog while an exact Local target resolves", () => {
    expect(shouldLoadCloudProjectCatalog({
      hasOpenWorkspace: true,
      workspaceIsCloud: false,
      hasLocalTargetHint: true,
      explicitBrowse: false,
    })).toBe(false);
    expect(shouldLoadCloudProjectCatalog({
      hasOpenWorkspace: true,
      workspaceIsCloud: false,
      hasLocalTargetHint: false,
      localTargetResolutionPending: true,
      explicitBrowse: true,
    })).toBe(false);
    expect(shouldLoadCloudProjectCatalog({
      hasOpenWorkspace: true,
      workspaceIsCloud: false,
      hasLocalTargetHint: true,
      explicitBrowse: true,
    })).toBe(false);
  });

  it("keeps the catalog available for Cloud-only or explicit unbound browsing", () => {
    expect(shouldLoadCloudProjectCatalog({
      hasOpenWorkspace: false,
      workspaceIsCloud: false,
      hasLocalTargetHint: false,
      explicitBrowse: false,
    })).toBe(true);
    expect(shouldLoadCloudProjectCatalog({
      hasOpenWorkspace: true,
      workspaceIsCloud: false,
      hasLocalTargetHint: false,
      explicitBrowse: true,
    })).toBe(true);
  });
});

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

describe("explicit workspace binding", () => {
  beforeEach(() => {
    getCloudProject.mockReset();
    createCloudWorkspaceBinding.mockReset();
    rotateCloudWorkspaceBindingCredential.mockReset();
    revokeCloudWorkspaceBinding.mockReset();
    revokeCloudWorkspaceBindingCredential.mockReset();
    revokeCloudWorkspaceBinding.mockResolvedValue(undefined);
    revokeCloudWorkspaceBindingCredential.mockResolvedValue(undefined);
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
    expect(result.remoteUrl).toBe("https://cloud.example/git/project-1.git");
    expect(result.credential).toBe("binding_secret");
    expect(result.remoteUrl).not.toContain(result.credential);
    expect(result.bindingWasCreated).toBe(true);
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
      onSessionChange: vi.fn(),
    });
    expect(rotateCloudWorkspaceBindingCredential).toHaveBeenCalledWith(
      session, "binding-1", expect.any(Function), session.api_base_url,
    );
  });

  it("revokes only the replacement credential when validation fails on an existing binding", async () => {
    createCloudWorkspaceBinding.mockResolvedValue(binding({
      credential: null,
      remote: { ...binding().remote, url: "https://wrong.example/git/project-1.git" },
    }));
    rotateCloudWorkspaceBindingCredential.mockResolvedValue("rotated_secret");

    await expect(createExplicitWorkspaceBinding({
      session,
      apiBaseUrl: session.api_base_url,
      project: { id: "project-1", name: "Notes", capabilities: ["workspace.bind.readonly"] },
      projectId: "project-1",
      workspace,
      onSessionChange: vi.fn(),
    })).rejects.toThrow("invalid Git remote locator");

    expect(revokeCloudWorkspaceBindingCredential).toHaveBeenCalledWith(
      session, "binding-1", expect.any(Function), session.api_base_url,
    );
    expect(revokeCloudWorkspaceBinding).not.toHaveBeenCalled();
  });

  it("revokes a newly created binding when its returned locator is invalid", async () => {
    createCloudWorkspaceBinding.mockResolvedValue(binding({
      remote: { ...binding().remote, url: "https://wrong.example/git/project-1.git" },
    }));

    await expect(createExplicitWorkspaceBinding({
      session,
      apiBaseUrl: session.api_base_url,
      project: { id: "project-1", name: "Notes", capabilities: ["workspace.bind.readonly"] },
      projectId: "project-1",
      workspace,
      onSessionChange: vi.fn(),
    })).rejects.toThrow("invalid Git remote locator");

    expect(revokeCloudWorkspaceBinding).toHaveBeenCalledWith(
      session, "binding-1", expect.any(Function), session.api_base_url,
    );
    expect(revokeCloudWorkspaceBindingCredential).not.toHaveBeenCalled();
  });
});

describe("binding-only attachment semantics", () => {
  it("requires confirmation for a legacy candidate and never promotes it to linked", () => {
    const attachment = resolveProjectCloudAttachment({
      configuredProjectId: null,
      bindingProjectId: null,
      remoteProjectId: "project-1",
      bindingError: cloudMessage("binding-confirm-workspace"),
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
      message: cloudMessage("binding-confirm-workspace"),
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
      bindingError: cloudMessage("binding-network-failed", undefined, "Network offline"),
      bindingReason: "network",
      bindingCloudLinked: true,
      bindingId: "binding-1",
      resolving: false,
    });
    expect(attachment).toEqual({
      status: "linked",
      projectId: "project-1",
      bindingId: "binding-1",
      warning: cloudMessage("binding-network-failed", undefined, "Network offline"),
    });
  });
});

describe("canonical Git locator discovery", () => {
  it("classifies exact project and scoped locators without treating them as authority", () => {
    expect(parsePuppyoneRemote("https://cloud.example/git/project-1.git")).toEqual({
      kind: "project",
      host: "cloud.example",
      displayId: "project-1",
      projectId: "project-1",
    });
    expect(parsePuppyoneRemote(
      "https://cloud.example/git/project-1/scopes/scope-docs.git",
    )).toEqual({
      kind: "scope",
      host: "cloud.example",
      displayId: "project-1/scope-docs",
      projectId: "project-1",
      scopeId: "scope-docs",
    });
  });

  it("rejects ambiguous encoded IDs and credential-bearing canonical locators", () => {
    expect(parsePuppyoneRemote(
      "https://cloud.example/git/project-1/scopes/scope%2Fchild.git",
    )).toBeNull();
    expect(parsePuppyoneRemote(
      "https://user:secret@cloud.example/git/project-1.git",
    )).toBeNull();
    expect(parsePuppyoneRemote(
      "https://cloud.example/git/project-1.git?token=secret",
    )).toBeNull();
    expect(parsePuppyoneRemote(
      "https://user:secret@cloud.example/git/ap/legacy-secret.git",
    )).toBeNull();
    expect(parsePuppyoneRemote(
      "ssh://cloud.example/git/project-1.git",
    )).toBeNull();
    expect(parsePuppyoneRemote(
      "file:///git/project-1.git",
    )).toBeNull();
  });
});

describe("project attachment routing", () => {
  it("binds the selected Project ID without a repo-identity or Scope-list preflight", () => {
    const source = readFileSync(
      new URL("../src/features/cloud/CloudServiceMainView.tsx", import.meta.url),
      "utf8",
    );
    const attachFlow = source
      .split("const handleConnectProject", 2)[1]
      ?.split("const handleCopyCloneCommand", 1)[0] ?? "";

    expect(attachFlow).toContain("onConfigureCloudRemote(project.id)");
    expect(attachFlow).not.toContain("getCloudRepoIdentity");
  });

  it("compensates both new and reused binding credentials after local setup failure", () => {
    const source = readFileSync(
      new URL("../src/App.tsx", import.meta.url),
      "utf8",
    );
    const attachFlow = source
      .split("const handleConfigureCloudRemote", 2)[1]
      ?.split("const handleDetachCloudProject", 1)[0] ?? "";

    expect(attachFlow).toContain("attached.bindingWasCreated");
    expect(attachFlow).toContain("revokeCloudWorkspaceBinding");
    expect(attachFlow).toContain("revokeCloudWorkspaceBindingCredential");
    expect(attachFlow).toContain("attached.binding.id");
  });
});
