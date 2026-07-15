import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { DesktopCloudProject, DesktopCloudSession } from "../src/lib/cloudApi";
import { issueWorkspaceGitRemote } from "../src/features/cloud/workspace/workspaceGitRemote";
import {
  describePuppyoneRemoteCandidates,
  parsePuppyoneRemote,
  resolveCanonicalPuppyoneRemotes,
  resolvePuppyoneRemotes,
} from "../src/features/source-control/remotes";
import { shouldLoadCloudProjectCatalog } from "../src/features/cloud/workspace/cloudProjectResolution";

const getCloudProject = vi.fn();
const issueCloudGitCredential = vi.fn();

vi.mock("../src/lib/cloudApi", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/cloudApi")>("../src/lib/cloudApi");
  return {
    ...actual,
    getCloudProject: (...args: unknown[]) => getCloudProject(...args),
    issueCloudGitCredential: (...args: unknown[]) => issueCloudGitCredential(...args),
  };
});

const session = {
  user_id: "user-1",
  user_email: "dev@example.com",
  api_base_url: "https://cloud.example/api/v1",
  session_generation: "generation-1",
} as DesktopCloudSession;

const project: DesktopCloudProject = {
  id: "project-1",
  name: "Notes",
  capabilities: ["content.write"],
};

describe("Project catalog policy", () => {
  it("never scans the Organization catalog from an open Local workspace", () => {
    expect(shouldLoadCloudProjectCatalog({
      hasOpenWorkspace: true,
      workspaceIsCloud: false,
    })).toBe(false);
    expect(shouldLoadCloudProjectCatalog({
      hasOpenWorkspace: false,
      workspaceIsCloud: false,
      workspaceRestoring: true,
    })).toBe(false);
  });

  it("keeps the catalog available only for global/home or Cloud-only browsing", () => {
    expect(shouldLoadCloudProjectCatalog({ hasOpenWorkspace: false, workspaceIsCloud: false })).toBe(true);
    expect(shouldLoadCloudProjectCatalog({ hasOpenWorkspace: true, workspaceIsCloud: false })).toBe(false);
    expect(shouldLoadCloudProjectCatalog({ hasOpenWorkspace: true, workspaceIsCloud: true })).toBe(true);
  });
});

describe("user-owned Git credentials", () => {
  beforeEach(() => {
    getCloudProject.mockReset();
    issueCloudGitCredential.mockReset();
  });

  it("issues a credential for the exact Project-root target without local identity", async () => {
    issueCloudGitCredential.mockResolvedValue({
      id: "credential-1",
      credential: "git_secret",
      remote: {
        url: "https://cloud.example/git/project-1.git",
        username: "x-puppyone-token",
        target: { kind: "project_root", project_id: "project-1" },
      },
    });

    const result = await issueWorkspaceGitRemote({
      session,
      apiBaseUrl: session.api_base_url,
      project,
      projectId: project.id,
      onSessionChange: vi.fn(),
    });

    expect(issueCloudGitCredential).toHaveBeenCalledWith(
      session,
      "project-1",
      {
        target: { kind: "project_root", project_id: "project-1" },
        mode: "rw",
      },
      expect.any(Function),
      session.api_base_url,
    );
    expect(result.remoteUrl).toBe("https://cloud.example/git/project-1.git");
    expect(result.credentialId).toBe("credential-1");
    expect(result.credential).toBe("git_secret");
    expect(JSON.stringify(issueCloudGitCredential.mock.calls[0])).not.toMatch(/workspace|device|checkout|path/i);
  });

  it("uses read-only mode without content.write and rejects a target from another Project", async () => {
    await expect(issueWorkspaceGitRemote({
      session,
      apiBaseUrl: session.api_base_url,
      project: { ...project, capabilities: ["content.read"] },
      projectId: project.id,
      target: { kind: "scope", project_id: "other-project", scope_id: "scope-docs" },
      onSessionChange: vi.fn(),
    })).rejects.toThrow("does not belong to the selected Cloud Project");
    expect(issueCloudGitCredential).not.toHaveBeenCalled();

    issueCloudGitCredential.mockResolvedValue({
      id: "credential-2",
      credential: "read_secret",
      remote: {
        url: "https://cloud.example/git/project-1/scopes/scope-docs.git",
        username: "x-puppyone-token",
        target: { kind: "scope", project_id: "project-1", scope_id: "scope-docs" },
      },
    });
    await issueWorkspaceGitRemote({
      session,
      apiBaseUrl: session.api_base_url,
      project: { ...project, capabilities: ["content.read"] },
      projectId: project.id,
      target: { kind: "scope", project_id: "project-1", scope_id: "scope-docs" },
      onSessionChange: vi.fn(),
    });
    expect(issueCloudGitCredential.mock.calls[0][2]).toEqual({
      target: { kind: "scope", project_id: "project-1", scope_id: "scope-docs" },
      mode: "r",
    });
  });

  it("rejects a credential response for another host or repository target", async () => {
    issueCloudGitCredential.mockResolvedValue({
      id: "credential-3",
      credential: "git_secret",
      remote: {
        url: "https://wrong.example/git/project-1.git",
        username: "x-puppyone-token",
        target: { kind: "project_root", project_id: "project-1" },
      },
    });
    await expect(issueWorkspaceGitRemote({
      session,
      apiBaseUrl: session.api_base_url,
      project,
      projectId: project.id,
      onSessionChange: vi.fn(),
    })).rejects.toThrow("invalid Git credential response");
  });
});

describe("canonical Git locator discovery", () => {
  it("classifies exact Project and Scope locators without treating them as authority", () => {
    expect(parsePuppyoneRemote("https://cloud.example/git/project-1.git")).toEqual({
      kind: "project",
      host: "cloud.example",
      origin: "https://cloud.example",
      displayId: "project-1",
      projectId: "project-1",
    });
    expect(parsePuppyoneRemote("https://cloud.example/git/project-1/scopes/scope-docs.git")).toEqual({
      kind: "scope",
      host: "cloud.example",
      origin: "https://cloud.example",
      displayId: "project-1/scope-docs",
      projectId: "project-1",
      scopeId: "scope-docs",
    });
  });

  it("deduplicates matching fetch/push locators and fails closed on conflicts", () => {
    const unique = resolvePuppyoneRemotes({
      remotes: [{
        name: "puppyone",
        fetchUrl: "https://cloud.example/git/project-1.git",
        pushUrl: "https://cloud.example/git/project-1.git",
        branches: [],
      }],
    } as never);
    expect(unique.status).toBe("unique");
    expect(unique.candidates).toHaveLength(2);

    const conflict = resolvePuppyoneRemotes({
      remotes: [{
        name: "puppyone",
        fetchUrl: "https://cloud.example/git/project-1.git",
        pushUrl: "https://cloud.example/git/project-2.git",
        branches: [],
      }],
    } as never);
    expect(conflict.status).toBe("conflict");
  });

  it("describes conflicts without exposing a legacy credential", () => {
    const secret = "pwg_secret-value-1234567890";
    const conflict = resolvePuppyoneRemotes({
      remotes: [
        {
          name: "legacy",
          fetchUrl: `https://cloud.example/git/ap/${secret}.git`,
          pushUrl: `https://cloud.example/git/ap/${secret}.git`,
          branches: [],
        },
        {
          name: "canonical",
          fetchUrl: "https://cloud.example/git/project-1.git",
          pushUrl: "https://cloud.example/git/project-1.git",
          branches: [],
        },
      ],
    } as never);
    const summary = describePuppyoneRemoteCandidates(conflict.candidates);
    expect(summary).not.toContain(secret);
    expect(summary).toContain("pwg_…7890");
    expect(summary).toContain("project-1");
  });

  it("never uses a legacy access-key remote as Cloud Project identity", () => {
    const status = {
      remotes: [{
        name: "legacy",
        fetchUrl: "https://cloud.example/git/ap/pwg_secret.git",
        pushUrl: "https://cloud.example/git/ap/pwg_secret.git",
        branches: [],
      }],
    } as never;
    expect(resolvePuppyoneRemotes(status).status).toBe("unique");
    expect(resolveCanonicalPuppyoneRemotes(status)).toEqual({ status: "none", candidates: [] });
  });

  it("rejects encoded IDs, embedded credentials, query secrets, SSH, and file URLs", () => {
    expect(parsePuppyoneRemote("https://cloud.example/git/project-1/scopes/scope%2Fchild.git")).toBeNull();
    expect(parsePuppyoneRemote("https://user:secret@cloud.example/git/project-1.git")).toBeNull();
    expect(parsePuppyoneRemote("https://cloud.example/git/project-1.git?token=secret")).toBeNull();
    expect(parsePuppyoneRemote("ssh://cloud.example/git/project-1.git")).toBeNull();
    expect(parsePuppyoneRemote("file:///git/project-1.git")).toBeNull();
  });
});

describe("repository-context architecture", () => {
  it("keeps context resolution out of the Project catalog and removes server-side local identity", () => {
    const dataSource = readFileSync(
      new URL("../src/features/cloud/data/useDesktopCloudData.ts", import.meta.url),
      "utf8",
    );
    const resolverSource = readFileSync(
      new URL("../src/features/cloud/workspace/useCloudWorkspaceContext.ts", import.meta.url),
      "utf8",
    );
    const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
    const combined = `${resolverSource}\n${appSource}`;

    expect(dataSource).not.toContain("listCloudProjects");
    expect(resolverSource).toContain("resolveCanonicalPuppyoneRemotes");
    expect(resolverSource).toContain("getCloudRepositoryContext");
    expect(resolverSource).not.toContain("remote_url");
    expect(combined).not.toMatch(/WorkspaceBinding|workspaceBinding|workspace_binding|cloudBinding|bindingId/);
    expect(appSource).toContain("issueWorkspaceGitRemote");
    expect(appSource).not.toMatch(/revokeCloudWorkspace|workspaceInstanceId/);
  });
});
