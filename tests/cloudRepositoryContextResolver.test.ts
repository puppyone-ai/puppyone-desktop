import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertCloudRemoteNameAvailable,
  assertExpectedGitRepositoryState,
} from "../src/features/cloud/workspace/workspaceGitRemote";
import {
  describePuppyoneRemoteCandidates,
  parsePuppyoneRemote,
  resolveCanonicalPuppyoneRemotes,
  resolvePuppyoneRemotes,
} from "../src/features/source-control/remotes";
import { shouldLoadCloudProjectCatalog } from "../src/features/cloud/workspace/cloudProjectResolution";

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

describe("Initialize remote collision policy", () => {
  it("refuses to repoint an existing canonical remote", () => {
    expect(() => assertCloudRemoteNameAvailable({
      remotes: [{ name: "PuppyOne" }],
    } as never)).toThrow('A Git remote named "puppyone" already exists');
  });

  it("ignores unrelated remotes", () => {
    expect(() => assertCloudRemoteNameAvailable({
      remotes: [{ name: "origin" }],
    } as never)).not.toThrow();
  });
});

describe("Initialize Git state race guard", () => {
  const reviewedStatus = {
    isRepo: true,
    headCommitId: "commit-reviewed",
    branch: "main",
    remotes: [],
  } as never;

  it("accepts the exact attached branch and HEAD reviewed by the caller", () => {
    expect(() => assertExpectedGitRepositoryState(reviewedStatus, {
      headCommitId: "commit-reviewed",
      branch: "main",
    })).not.toThrow();
  });

  it.each([
    ["repository disappeared", { isRepo: false }],
    ["HEAD disappeared", { headCommitId: null }],
    ["branch disappeared", { branch: null }],
    ["repository reported HEAD", { branch: "HEAD" }],
    ["repository became detached", { branch: "DeTaChEd" }],
    ["HEAD changed", { headCommitId: "commit-new" }],
    ["branch changed", { branch: "feature/new" }],
  ])("rejects when the %s", (_label, change) => {
    expect(() => assertExpectedGitRepositoryState({
      ...reviewedStatus,
      ...change,
    }, {
      headCommitId: "commit-reviewed",
      branch: "main",
    })).toThrow("local Git branch or HEAD changed");
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

    // The global Cloud Projects route may explicitly request the catalog, but
    // repository identity resolution must never consult it. Exact local
    // context continues to come only from the canonical Git locator.
    expect(dataSource).toContain("loadProjectCatalog = false");
    expect(dataSource).toContain("if (!activeProjectId)");
    expect(resolverSource).not.toContain("listCloudProjects");
    expect(appSource).not.toContain("listCloudProjects");
    expect(resolverSource).toContain("resolveCanonicalPuppyoneRemotes");
    expect(resolverSource).toContain("getCloudRepositoryContext");
    expect(resolverSource).not.toContain("remote_url");
    expect(combined).not.toMatch(/WorkspaceBinding|workspaceBinding|workspace_binding|cloudBinding|bindingId/);
    expect(appSource).toContain("connectWorkspaceCloudProject");
    expect(appSource).not.toMatch(/issueWorkspaceGitRemote|issueCloudGitCredential|configureGitCloudRemote/);
    expect(appSource).not.toMatch(/revokeCloudWorkspace|workspaceInstanceId/);
  });

  it("routes canonical remote mutation through the typed main-owned coordinator", () => {
    const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
    const collisionPreflight = appSource.indexOf("assertCloudRemoteNameAvailable(freshStatus)");
    const firstGitStateGuard = appSource.indexOf("configuredStatus = await readAndValidateFreshStatus()");
    const remoteMutation = appSource.indexOf("const connected = await connectWorkspaceCloudProject");

    expect(collisionPreflight).toBeGreaterThan(-1);
    expect(collisionPreflight).toBeLessThan(remoteMutation);
    expect(firstGitStateGuard).toBeLessThan(remoteMutation);
    expect(appSource).not.toMatch(/credential\s*[:=]|configureWorkspaceCloudRemote/);
    expect(appSource).toContain("headCommitId: options.expectedHeadCommitId");
    expect(appSource).toContain("branch: options.expectedBranch");
    expect(appSource).toContain("if (!options.deferStatusPublication)");
  });
});
