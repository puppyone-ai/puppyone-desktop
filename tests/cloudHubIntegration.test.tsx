/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachmentHasBoundProject,
  getAttachedCloudProjectId,
  isProjectCloudLinked,
  resolveCloudHubSectionAfterBindingChange,
  resolveCloudHubSectionForAttachment,
  resolveCloudProjectNavigationContext,
  resolveProjectCloudAttachment,
} from "../src/features/cloud/attachment/projectCloudAttachment";
import { adaptCloudAggregateToAccessData } from "../src/features/cloud/data/adaptCloudAggregateToAccessData";
import { loadCloudProjectDetails } from "../src/features/cloud/data/cloudProjectDetails";
import { CloudHistorySection } from "../src/features/cloud/sections/HistorySection";
import { CloudAutomationRouteSection } from "../src/features/cloud/sections/AutomationRouteSection";
import { CloudServiceSidebar } from "../src/features/cloud/CloudServiceSidebar";
import { CloudServiceMainView } from "../src/features/cloud/CloudServiceMainView";
import { useCloudAuthController } from "../src/features/cloud/hooks/useCloudAuthController";
import { useCloudProjectHome } from "../src/features/cloud/hooks/useCloudProjectHome";
import { CloudProjectBrowser } from "../src/features/cloud/components/ProjectBrowser";
import { CloudRouter } from "../src/features/cloud/routes/CloudRouter";
import {
  useDesktopCloudData,
  type DesktopCloudDataState,
} from "../src/features/cloud/data/useDesktopCloudData";
import { useDesktopCloudAccessData } from "../src/features/cloud/data/useDesktopCloudAccessData";
import { resolveCloudEnvironment, type CloudEnvironment } from "../src/features/cloud/environment";
import { cloudMessage } from "../src/features/cloud/cloudPresentation";
import type { DesktopCloudScope, DesktopCloudSession } from "../src/lib/cloudApi";
import type {
  DesktopCloudHistory,
  DesktopCloudHistoryCommit,
} from "../src/lib/cloudHistoryApi";
import type { GitStatusSnapshot } from "../src/types/electron";
import { renderWithTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getCloudHistory = vi.fn();
const listCloudAutomationProviderSpecs = vi.fn();
const listCloudScopes = vi.fn();
const listCloudConnectors = vi.fn();
const listCloudMcpEndpoints = vi.fn();
const getCloudRepoIdentity = vi.fn();
const getCloudProjectReadiness = vi.fn().mockResolvedValue({
  project_id: "proj-1",
  git: {
    target: { kind: "project_root", project_id: "proj-1" },
    surface_exists: false,
    head_exists: false,
    push_accepted: false,
    default_branch: "main",
    state: "git_not_created",
  },
  claude: {
    ready: false,
    blockers: [
      "project_git_surface_missing",
      "project_head_missing",
      "project_git_push_not_accepted",
    ],
  },
});
const getCloudDashboard = vi.fn();
const listCloudRoot = vi.fn();
const listCloudProjects = vi.fn();
const getCloudProject = vi.fn();

function historyPage(overrides: Partial<DesktopCloudHistory> = {}): DesktopCloudHistory {
  return {
    project_id: "proj-1",
    commits: [],
    topology_available: true,
    head_commit_id: null,
    refs: [],
    refs_included: true,
    snapshot_id: "history-snapshot".padEnd(64, "0"),
    next_cursor: null,
    has_more: false,
    total: 0,
    graph_health: "complete",
    unreadable_commit_ids: [],
    ...overrides,
  };
}

function historyCommit(
  overrides: Pick<DesktopCloudHistoryCommit, "commit_id" | "parent_ids"> & Partial<DesktopCloudHistoryCommit>,
): DesktopCloudHistoryCommit {
  return {
    who: "Cloud Author",
    message: "Update workspace",
    changes: [],
    conflicts: [],
    root_hash: "",
    scope_hash: "",
    scope_path: "",
    created_at: null,
    audit_detail: null,
    ...overrides,
  };
}

vi.mock("../src/lib/cloudApi", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/cloudApi")>("../src/lib/cloudApi");
  return {
    ...actual,
    listCloudAutomationProviderSpecs: (...args: unknown[]) => listCloudAutomationProviderSpecs(...args),
    listCloudScopes: (...args: unknown[]) => listCloudScopes(...args),
    listCloudConnectors: (...args: unknown[]) => listCloudConnectors(...args),
    listCloudMcpEndpoints: (...args: unknown[]) => listCloudMcpEndpoints(...args),
    getCloudRepoIdentity: (...args: unknown[]) => getCloudRepoIdentity(...args),
    getCloudProjectReadiness: (...args: unknown[]) => getCloudProjectReadiness(...args),
    getCloudDashboard: (...args: unknown[]) => getCloudDashboard(...args),
    listCloudRoot: (...args: unknown[]) => listCloudRoot(...args),
    listCloudProjects: (...args: unknown[]) => listCloudProjects(...args),
    getCloudProject: (...args: unknown[]) => getCloudProject(...args),
    openCloudApp: vi.fn(),
  };
});

vi.mock("../src/lib/cloudHistoryApi", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/cloudHistoryApi")>("../src/lib/cloudHistoryApi");
  return {
    ...actual,
    getCloudHistory: (...args: unknown[]) => getCloudHistory(...args),
  };
});

vi.mock("../src/features/cloud/auth", async () => {
  const actual = await vi.importActual<typeof import("../src/features/cloud/auth")>("../src/features/cloud/auth");
  return {
    ...actual,
    resolveCloudAuthState: ({ cloudSession }: { cloudSession: DesktopCloudSession | null }) => (
      cloudSession
        ? { status: "signed-in" as const, apiBaseUrl: "https://cloud.example", session: cloudSession }
        : { status: "signed-out" as const, apiBaseUrl: null }
    ),
  };
});


let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const session = {
  user_id: "user-1",
  user_email: "dev@example.com",
  api_base_url: "https://cloud.example",
  session_generation: 1,
} as DesktopCloudSession;

describe("Cloud environment endpoint precedence", () => {
  it("keeps the configured loopback API when a local workspace has a hosted Puppyone remote", () => {
    const environment = resolveCloudEnvironment({
      status: {
        remotes: [{
          name: "puppyone",
          fetchUrl: "https://api.puppyone.ai/git/ap/example.git",
          pushUrl: "https://api.puppyone.ai/git/ap/example.git",
          branches: [],
        }],
      } as GitStatusSnapshot,
      desktopApiBaseUrl: "http://localhost:9090/api/v1",
    });

    expect(environment.apiBaseUrl).toBe("http://localhost:9090/api/v1");
    expect(environment.cloudRemote?.rawUrl).toBe("https://api.puppyone.ai/git/ap/example.git");
  });
});

describe("Cloud browser sign-in state", () => {
  it("keeps browser sign-in progress in the button without creating a success message", async () => {
    const startCloudOAuth = vi.fn().mockResolvedValue({ ok: true });
    const previousBridge = window.puppyoneDesktop;
    Object.defineProperty(window, "puppyoneDesktop", {
      configurable: true,
      value: { startCloudOAuth },
    });

    function AuthHarness() {
      const auth = useCloudAuthController({
        cloudApiBaseUrl: "http://localhost:9090/api/v1",
        accountEmail: null,
        onSignedIn: vi.fn(),
        onRefresh: vi.fn(),
      });
      return (
        <button type="button" onClick={() => auth.startProviderLogin()}>
          {auth.loading ?? "idle"}|{auth.message ?? ""}
        </button>
      );
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      renderWithTestLocalization(root, <AuthHarness />);
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startCloudOAuth).toHaveBeenCalledWith({
      apiBaseUrl: "http://localhost:9090/api/v1",
      provider: undefined,
    });
    expect(container.textContent).toBe("browser|");

    Object.defineProperty(window, "puppyoneDesktop", {
      configurable: true,
      value: previousBridge,
    });
  });
});

describe("ProjectCloudAttachment binding-only semantics", () => {
  it("does not infer offline from a missing Cloud session", () => {
    const attachment = resolveProjectCloudAttachment({
      resolvedProjectId: "proj-1",
      remoteProjectId: null,
      bindingError: null,
      bindingCloudLinked: true,
      resolutionSource: "workspace-binding",
      bindingStatus: "bound",
      target: { kind: "project_root", project_id: "proj-1" },
      resolving: false,
    });
    expect(attachment).toEqual({
      status: "resolved",
      projectId: "proj-1",
      resolutionSource: "workspace-binding",
      bindingStatus: "bound",
      target: { kind: "project_root", project_id: "proj-1" },
    });
    expect(isProjectCloudLinked(attachment)).toBe(true);
  });

  it("keeps a known project structurally linked while preserving a resolver warning", () => {
    const attachment = resolveProjectCloudAttachment({
      resolvedProjectId: "proj-err",
      remoteProjectId: null,
      bindingError: "Mapping failed",
      bindingCloudLinked: true,
      resolutionSource: "workspace-binding",
      bindingStatus: "bound",
      target: { kind: "project_root", project_id: "proj-err" },
      resolving: false,
    });
    expect(attachment).toEqual({
      status: "resolved",
      projectId: "proj-err",
      resolutionSource: "workspace-binding",
      bindingStatus: "bound",
      target: { kind: "project_root", project_id: "proj-err" },
      warning: "Mapping failed",
    });
    expect(isProjectCloudLinked(attachment)).toBe(true);
    expect(attachmentHasBoundProject(attachment)).toBe(true);
    expect(getAttachedCloudProjectId(attachment)).toBe("proj-err");
  });

  it("resets Cloud Hub section when switching linked → unlinked", () => {
    expect(resolveCloudHubSectionForAttachment({
      status: "resolved",
      projectId: "a",
      resolutionSource: "workspace-binding",
      bindingStatus: "bound",
      target: { kind: "project_root", project_id: "a" },
    })).toBe("contents");
    expect(resolveCloudHubSectionForAttachment({ status: "local-only", projectId: null })).toBe("overview");
    expect(resolveCloudHubSectionForAttachment({
      status: "error",
      projectId: null,
      message: "boom",
    })).toBe("overview");
  });

  it("keeps a known binding bound during a resolver error", () => {
    const degradedBinding = {
      status: "resolved" as const,
      projectId: "proj-known",
      resolutionSource: "workspace-binding" as const,
      bindingStatus: "bound" as const,
      target: { kind: "project_root" as const, project_id: "proj-known" },
      warning: "Cloud is temporarily unavailable",
    };

    expect(resolveCloudProjectNavigationContext(degradedBinding)).toEqual({
      projectContext: true,
      localWorkspaceContext: true,
    });
  });

  it("does not let a binding effect overwrite an explicit post-Attach route", () => {
    expect(resolveCloudHubSectionAfterBindingChange({
      currentSection: "access",
      hasBoundProject: true,
      workspaceChanged: false,
    })).toBe("access");
    expect(resolveCloudHubSectionAfterBindingChange({
      currentSection: "overview",
      hasBoundProject: true,
      workspaceChanged: false,
    })).toBe("contents");
    expect(resolveCloudHubSectionAfterBindingChange({
      currentSection: "history",
      hasBoundProject: false,
      workspaceChanged: false,
    })).toBe("overview");
  });
});

describe("CloudServiceSidebar project context", () => {
  it("previews the project workspace navigation while signed out", () => {
    const onSelectSection = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderWithTestLocalization(root,
      <CloudServiceSidebar
        status={null}
        cloudSession={null}
        activeSection="overview"
        onSelectSection={onSelectSection}
      />,
    ));

    const rows = Array.from(container.querySelectorAll<HTMLButtonElement>(".desktop-cloud-sidebar-nav-row"));
    expect(rows.map((row) => row.textContent)).toEqual([
      "Overview",
      "History",
      "Claude",
      "Automation",
      "Access",
      "Settings",
      "Team",
      "Billing",
    ]);
    const groups = Array.from(container.querySelectorAll<HTMLElement>(".po-desktop-sidebar-group"));
    expect(groups.map((group) => (
      group.querySelector(".po-desktop-sidebar-group__title")?.textContent
    ))).toEqual(["Cloud Project", "Organization"]);
    expect(groups.every((group) => group.dataset.disabled === "true")).toBe(true);
    expect(Array.from(groups[0]?.querySelectorAll(".desktop-cloud-sidebar-nav-row") ?? []).map((row) => row.textContent)).toEqual([
      "Overview",
      "History",
      "Claude",
      "Automation",
      "Access",
      "Settings",
    ]);
    expect(Array.from(groups[1]?.querySelectorAll(".desktop-cloud-sidebar-nav-row") ?? []).map((row) => row.textContent)).toEqual([
      "Team",
      "Billing",
    ]);
    expect(container.querySelector(".desktop-cloud-sidebar-separator")).toBeNull();
    expect(rows.every((row) => !row.classList.contains("active"))).toBe(true);

    const lockedRows = rows;
    expect(lockedRows).toHaveLength(8);
    expect(lockedRows.every((row) => row.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(container.querySelector(".desktop-cloud-sidebar-nav-lock")).toBeNull();

    act(() => lockedRows[3]?.click());
    expect(onSelectSection).not.toHaveBeenCalled();
  });

  it("does not treat a stale project route as project context without binding/selection", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderWithTestLocalization(root,
      <CloudServiceSidebar
        status={null}
        cloudSession={session}
        activeSection="history"
        projectContext={false}
        localWorkspaceContext={false}
        onSelectSection={vi.fn()}
      />,
    ));

    expect(container.querySelector('[aria-label="Cloud sections"]')).not.toBeNull();
    expect(container.textContent).toContain("Cloud Projects");
    expect(container.textContent).toContain("Templates");
    expect(container.textContent).not.toContain("History");
  });

  it("shows project hub nav only when projectContext is true", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderWithTestLocalization(root,
      <CloudServiceSidebar
        status={null}
        cloudSession={session}
        activeSection="history"
        projectContext
        localWorkspaceContext
        onSelectSection={vi.fn()}
      />,
    ));

    expect(container.querySelector('[aria-label="Cloud project sections"]')).not.toBeNull();
    expect(container.textContent).toContain("History");
    expect(container.textContent).toContain("Automation");
    expect(container.textContent).toContain("Access");
    expect(container.textContent).toContain("Team");
    expect(container.textContent).toContain("Billing");
    expect(container.querySelector(".desktop-cloud-sidebar-context-back")).toBeNull();
  });

  it("renders project-management navigation from server capabilities", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderWithTestLocalization(root,
      <CloudServiceSidebar
        status={null}
        cloudSession={session}
        activeSection="contents"
        projectContext
        localWorkspaceContext
        projectCapabilities={["project.read", "agent.read"]}
        onSelectSection={vi.fn()}
      />,
    ));
    expect(container.textContent).toContain("Claude");
    expect(container.textContent).not.toContain("Settings");

    act(() => renderWithTestLocalization(root,
      <CloudServiceSidebar
        status={null}
        cloudSession={session}
        activeSection="contents"
        projectContext
        localWorkspaceContext
        projectCapabilities={["project.read", "agent.read", "project.settings.manage"]}
        onSelectSection={vi.fn()}
      />,
    ));
    expect(container.textContent).toContain("Settings");
  });

  it("back to Cloud Projects clears browse context via onBackToProjects", () => {
    const onBackToProjects = vi.fn();
    const onSelectSection = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderWithTestLocalization(root,
      <CloudServiceSidebar
        status={null}
        cloudSession={session}
        activeSection="contents"
        projectContext
        localWorkspaceContext={false}
        onSelectSection={onSelectSection}
        onBackToProjects={onBackToProjects}
      />,
    ));

    expect(container.textContent).toContain("Cloud Projects");
    act(() => {
      container.querySelector<HTMLButtonElement>(".desktop-cloud-sidebar-context-back")?.click();
    });

    expect(onBackToProjects).toHaveBeenCalledTimes(1);
    expect(onSelectSection).not.toHaveBeenCalled();
  });

  it("returns to the Cloud Projects list after back when browse context is cleared", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderWithTestLocalization(root,
      <CloudServiceSidebar
        status={null}
        cloudSession={session}
        activeSection="contents"
        projectContext
        localWorkspaceContext={false}
        onSelectSection={vi.fn()}
      />,
    ));
    expect(container.querySelector('[aria-label="Cloud project sections"]')).not.toBeNull();

    act(() => renderWithTestLocalization(root,
      <CloudServiceSidebar
        status={null}
        cloudSession={session}
        activeSection="overview"
        projectContext={false}
        localWorkspaceContext={false}
        onSelectSection={vi.fn()}
      />,
    ));

    expect(container.querySelector('[aria-label="Cloud sections"]')).not.toBeNull();
    expect(container.textContent).toContain("Cloud Projects");
    expect(container.querySelector(".desktop-cloud-sidebar-context-back")).toBeNull();
  });
});

describe("Cloud History route", () => {
  beforeEach(() => {
    getCloudHistory.mockReset();
  });

  it("shows History unavailable when the History API fails", async () => {
    getCloudHistory.mockRejectedValue(new Error("history backend down"));
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudHistorySection
          projectId="proj-1"
          projectName="Demo"
          cloudSession={session}
          apiBaseUrl="https://cloud.example"
          onSessionChange={vi.fn()}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getCloudHistory).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("History unavailable");
    expect(container.textContent).toContain("history backend down");
    expect(container.textContent).not.toContain("No commits yet");
  });

  it("renders the Cloud History route as a synchronized tree and detail pane", async () => {
    const head = "a".repeat(40);
    const parent = "b".repeat(40);
    getCloudHistory.mockResolvedValue(historyPage({
      project_id: "proj-1",
      head_commit_id: head,
      refs: [{ ref_name: "refs/heads/main", ref_type: "branch", commit_id: head }],
      commits: [
        historyCommit({ commit_id: head, parent_ids: [parent], message: "Head commit", who: "Ada" }),
        historyCommit({ commit_id: parent, parent_ids: [], message: "Parent commit", who: "Lin" }),
      ],
      total: 2,
    }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudHistorySection
          projectId="proj-1"
          projectName="Demo"
          cloudSession={session}
          apiBaseUrl="https://cloud.example"
          onSessionChange={vi.fn()}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector(".desktop-cloud-history-surface")).not.toBeNull();
    expect(container.querySelector(".desktop-cloud-history-sidebar")).not.toBeNull();
    expect(container.querySelector(".desktop-cloud-project-history-view")).not.toBeNull();
    expect(container.querySelectorAll('button[data-commit-id]')).toHaveLength(2);
    expect(container.querySelector("h1")?.textContent).toBe("Head commit");

    const parentRow = Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-commit-id]'))
      .find((row) => row.textContent?.includes("Parent commit"));
    await act(async () => parentRow?.click());
    expect(container.querySelector("h1")?.textContent).toBe("Parent commit");
  });

  it("appends an older cursor page without replacing the selected graph", async () => {
    const head = "c".repeat(40);
    const parent = "d".repeat(40);
    getCloudHistory
      .mockResolvedValueOnce(historyPage({
        project_id: "proj-1",
        head_commit_id: head,
        refs: [{ ref_name: "refs/heads/main", ref_type: "branch", commit_id: head }],
        commits: [historyCommit({ commit_id: head, parent_ids: [parent], message: "Head" })],
        has_more: true,
        next_cursor: head,
        total: 2,
      }))
      .mockResolvedValueOnce(historyPage({
        project_id: "proj-1",
        head_commit_id: head,
        refs: [],
        refs_included: false,
        commits: [historyCommit({ commit_id: parent, parent_ids: [], message: "Parent" })],
        has_more: false,
        next_cursor: null,
        total: 2,
      }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudHistorySection
          projectId="proj-1"
          projectName="Demo"
          cloudSession={session}
          apiBaseUrl="https://cloud.example"
          onSessionChange={vi.fn()}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    const selectedBefore = container.querySelector('button[data-commit-id][aria-current="true"]')?.textContent;
    const loadMore = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("Load more"));

    await act(async () => {
      loadMore?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getCloudHistory).toHaveBeenNthCalledWith(
      2,
      session,
      "proj-1",
      80,
      expect.any(Function),
      "https://cloud.example",
      head,
    );
    expect(container.querySelectorAll('button[data-commit-id]')).toHaveLength(2);
    expect(container.querySelector('button[data-commit-id][aria-current="true"]')?.textContent)
      .toBe(selectedBefore);
  });
});

describe("CloudRouter local context", () => {
  it("does not promote aggregate project data in an open local-only workspace", async () => {
    getCloudHistory.mockReset();
    getCloudHistory.mockResolvedValue(historyPage({ project_id: "proj-browse" }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudRouter
          workspace={{ id: "local-1", name: "Local Notes", path: "/tmp/local-notes" }}
          status={null}
          cloudSession={session}
          cloudApiBaseUrl="https://cloud.example"
          cloudRemote={null}
          cloudData={createAggregateCloudData(vi.fn(async () => undefined), {
            projects: [{ id: "proj-preview", name: "Preview Project" }],
            mappedProjectId: null,
            mappedProject: null,
            activeProjectId: "proj-preview",
            activeProject: { id: "proj-preview", name: "Preview Project" },
          })}
          activeSection="history"
          accountEmail={session.user_email}
          accountConnected
          branchName="main"
          localChangeCount={0}
          loading={false}
          cloudBackupLoading={false}
          onSessionChange={vi.fn()}
          onBackupWorkspace={vi.fn()}
          onOpenProject={vi.fn()}
          onOpenGitSettings={vi.fn()}
          onSelectSection={vi.fn()}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getCloudHistory).not.toHaveBeenCalled();
    expect(container.textContent).toContain("History");
    expect(container.textContent).toContain("Back up and connect");
    expect(container.textContent).not.toContain("Preview Project");
    expect(container.textContent).not.toContain("Local mapping");
  });
});

describe("Cloud project attachment actions", () => {
  it("disables every competing attach/create action while one project is connecting", async () => {
    listCloudRoot.mockReset();
    listCloudRoot.mockResolvedValue({ entries: [] });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudProjectBrowser
          projects={[
            { id: "proj-a", name: "Project A" },
            { id: "proj-b", name: "Project B" },
          ]}
          loading={false}
          session={session}
          apiBaseUrl="https://cloud.example"
          mappedProjectId={null}
          backupLoading={false}
          cloudAction={{ kind: "connect", projectId: "proj-a" }}
          onSessionChange={vi.fn()}
          onBackupWorkspace={vi.fn()}
          onSelectProject={vi.fn()}
          onConnectProject={vi.fn()}
          onOpenCloudProjects={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    const attachButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".desktop-project-folder-card-action"),
    );
    expect(attachButtons).toHaveLength(2);
    expect(attachButtons.every((button) => button.disabled)).toBe(true);
    expect(container.querySelector<HTMLButtonElement>(".desktop-project-folder-new-card")?.disabled).toBe(true);
  });
});

describe("Resolved Cloud binding recovery", () => {
  it("keeps the Project visible and offers an explicit repair when its canonical remote is missing", async () => {
    const localSession = {
      ...session,
      api_base_url: "http://localhost:9090",
    } as DesktopCloudSession;
    getCloudProject.mockResolvedValue({ id: "proj-1", name: "Project One" });
    getCloudDashboard.mockResolvedValue({ project: { id: "proj-1", name: "Project One" } });
    listCloudRoot.mockResolvedValue({ entries: [] });
    getCloudHistory.mockResolvedValue(historyPage());
    listCloudScopes.mockResolvedValue([]);
    listCloudConnectors.mockResolvedValue([]);
    listCloudMcpEndpoints.mockResolvedValue([]);
    getCloudRepoIdentity.mockResolvedValue(null);
    const onConfigureCloudRemote = vi.fn().mockResolvedValue({ isRepo: true });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudServiceMainView
          workspace={{
            id: "local-1",
            name: "Local Notes",
            path: "/tmp/local-notes",
            workspaceInstanceId: "workspace-instance-1",
          }}
          status={{
            isRepo: true,
            branch: "main",
            branches: [],
            stagedEntries: [],
            unstagedEntries: [],
            untrackedEntries: [],
            remotes: [],
          } as unknown as GitStatusSnapshot}
          puppyoneConfig={null}
          cloudApiBaseUrl="http://localhost:9090"
          cloudSession={localSession}
          attachment={{
            status: "resolved",
            projectId: "proj-1",
            resolutionSource: "workspace-binding",
            bindingStatus: "bound",
            bindingId: "binding-1",
            target: { kind: "project_root", project_id: "proj-1" },
            warning: cloudMessage("binding-remote-missing"),
          }}
          onCloudSessionChange={vi.fn()}
          activeSection="contents"
          loading={false}
          error={null}
          cloudBackupLoading={false}
          cloudBackupError={null}
          onStartPuppyoneBackup={vi.fn()}
          onConfigureCloudRemote={onConfigureCloudRemote}
          onSelectSection={vi.fn()}
          onRefresh={vi.fn()}
          onOpenDetails={vi.fn()}
          onOpenGitSettings={vi.fn()}
        />,
      );
      await flushPromises();
    });

    const warning = container.querySelector<HTMLElement>(".desktop-cloud-main-alert.warning");
    expect(warning?.textContent).toContain("canonical Git remote is missing");
    expect(container.textContent).toContain("Project One");
    const repairButton = Array.from(warning?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("Repair connection"));
    expect(repairButton).toBeDefined();

    await act(async () => {
      repairButton?.click();
      await flushPromises();
    });

    expect(onConfigureCloudRemote).toHaveBeenCalledWith("proj-1", {
      target: { kind: "project_root", project_id: "proj-1" },
    });
  });
});

describe("Cloud Automation route dedupe", () => {
  it("reuses aggregate Cloud data and does not call useDesktopCloudAccessData", async () => {
    listCloudAutomationProviderSpecs.mockResolvedValue([]);
    await import("../src/features/automation/DesktopCloudAutomationView");
    const reload = vi.fn(async () => undefined);
    const cloudData = createAggregateCloudData(reload);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudAutomationRouteSection
          projectId="proj-1"
          cloudSession={session}
          apiBaseUrl="https://cloud.example"
          cloudData={cloudData}
          onSessionChange={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    expect(listCloudScopes).not.toHaveBeenCalled();
    expect(listCloudConnectors).not.toHaveBeenCalled();
    expect(listCloudMcpEndpoints).not.toHaveBeenCalled();
    expect(container.querySelector(".desktop-cloud-main-view")).toBeNull();
    await act(async () => {
      await vi.waitFor(() => {
        expect(container.querySelectorAll(".desktop-cloud-automation-page")).toHaveLength(1);
      });
    });
    expect(adaptCloudAggregateToAccessData({
      apiBaseUrl: "https://cloud.example",
      scopes: cloudData.scopes,
      connectors: cloudData.connectors,
      mcpEndpoints: cloudData.mcpEndpoints,
      identity: cloudData.identity,
      loading: false,
      error: null,
      warning: null,
      reload,
    }).connectors).toHaveLength(1);
  });
});

describe("No eager Cloud Access on Local Files", () => {
  it("does not enable Access loading for Local workspaces even with a bound project id", async () => {
    const { shouldLoadDesktopCloudAccessData } = await import("../src/features/cloud/data/shouldLoadDesktopCloudAccessData");
    expect(shouldLoadDesktopCloudAccessData({
      workspaceKind: "local",
      activeView: "data",
    })).toBe(false);
    expect(shouldLoadDesktopCloudAccessData({
      workspaceKind: "local",
      activeView: "cloud",
    })).toBe(false);
    expect(shouldLoadDesktopCloudAccessData({
      workspaceKind: "cloud",
      activeView: "access",
    })).toBe(true);
  });

  it("does not publish an Access response after its project context is disabled", async () => {
    const delayedScopes = deferred<DesktopCloudScope[]>();
    listCloudScopes.mockReset();
    listCloudConnectors.mockReset();
    listCloudMcpEndpoints.mockReset();
    getCloudRepoIdentity.mockReset();
    listCloudScopes.mockImplementationOnce(() => delayedScopes.promise);
    listCloudConnectors.mockResolvedValue([]);
    listCloudMcpEndpoints.mockResolvedValue([]);
    getCloudRepoIdentity.mockResolvedValue(null);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root, <CloudAccessDataProbe projectId="proj-a" />);
      await Promise.resolve();
    });

    await act(async () => {
      renderWithTestLocalization(root, <CloudAccessDataProbe projectId={null} />);
      await Promise.resolve();
    });
    expect(container.firstElementChild?.getAttribute("data-scope-count")).toBe("0");
    expect(container.firstElementChild?.getAttribute("data-loading")).toBe("false");

    await act(async () => {
      delayedScopes.resolve([{
        id: "scope-a",
        project_id: "proj-a",
        path: "/docs",
        name: "Docs",
        max_mode: "rw",
      } as DesktopCloudScope]);
      await flushPromises();
    });
    expect(container.firstElementChild?.getAttribute("data-scope-count")).toBe("0");
  });
});

describe("History partial failure in aggregate details", () => {
  it("keeps History null and surfaces a warning when History rejects", async () => {
    getCloudDashboard.mockResolvedValue({ project: { id: "proj-1", name: "Demo" } });
    listCloudRoot.mockResolvedValue({ entries: [] });
    getCloudHistory.mockRejectedValue(new Error("history timeout"));
    listCloudScopes.mockResolvedValue([]);
    listCloudConnectors.mockResolvedValue([]);
    listCloudMcpEndpoints.mockResolvedValue([]);
    getCloudRepoIdentity.mockResolvedValue(null);

    const details = await loadCloudProjectDetails({
      session,
      projectId: "proj-1",
      projects: [{ id: "proj-1", name: "Demo" }],
      onSessionChange: vi.fn(),
      cloudApiBaseUrl: "https://cloud.example",
    });

    expect(details.history).toBeNull();
    expect(details.warning).toMatchObject({ code: "project-details-partial" });
  });
});

describe("global Project catalog ownership", () => {
  it("keeps catalog enumeration in the explicit home owner", async () => {
    listCloudProjects.mockResolvedValue([{ id: "proj-home", name: "Home Project" }]);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root, <HomeCatalogProbe />);
      await flushPromises();
    });

    expect(listCloudProjects).toHaveBeenCalledWith(
      session,
      expect.any(Function),
      "https://cloud.example",
    );
    expect(container.querySelector("output")?.getAttribute("data-project-count")).toBe("1");
  });
});

describe("useDesktopCloudData request lifecycle", () => {
  const projects = [
    { id: "proj-a", name: "Project A" },
    { id: "proj-b", name: "Project B" },
  ];
  const cloudEnvironment: CloudEnvironment = {
    apiBaseUrl: "https://cloud.example",
    source: "default",
    cloudRemote: null,
    configuredProjectId: null,
  };

  beforeEach(() => {
    listCloudProjects.mockReset();
    getCloudProject.mockReset();
    getCloudDashboard.mockReset();
    listCloudRoot.mockReset();
    getCloudHistory.mockReset();
    listCloudScopes.mockReset();
    listCloudConnectors.mockReset();
    listCloudMcpEndpoints.mockReset();
    getCloudRepoIdentity.mockReset();

    listCloudProjects.mockResolvedValue(projects);
    getCloudProject.mockImplementation(async (_session: unknown, projectId: string) => ({
      id: projectId,
      name: projectId === "proj-bound" ? "Bound Project" : projectId,
    }));
    getCloudDashboard.mockImplementation(async (_session: unknown, projectId: string) => ({
      project: { id: projectId, name: projectId === "proj-a" ? "Project A" : "Project B" },
    }));
    listCloudRoot.mockResolvedValue({ entries: [] });
    getCloudHistory.mockResolvedValue(historyPage());
    listCloudScopes.mockResolvedValue([]);
    listCloudConnectors.mockResolvedValue([]);
    listCloudMcpEndpoints.mockResolvedValue([]);
    getCloudRepoIdentity.mockResolvedValue(null);
  });

  it("stays local-only without requesting the organization catalog or any Project data", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudDataProbe
          explicitProjectId={null}
          environment={cloudEnvironment}
        />,
      );
      await flushPromises();
    });

    expect(container.firstElementChild?.getAttribute("data-active-project")).toBe("none");
    expect(container.firstElementChild?.getAttribute("data-loading")).toBe("false");
    expect(listCloudProjects).not.toHaveBeenCalled();
    expect(getCloudProject).not.toHaveBeenCalled();
    expect(getCloudDashboard).not.toHaveBeenCalled();
  });

  it("clears the previous project's payload as soon as browse context changes", async () => {
    const secondProject = deferred<(typeof projects)[number]>();
    getCloudProject
      .mockResolvedValueOnce(projects[0])
      .mockImplementationOnce(() => secondProject.promise);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root, <CloudDataProbe explicitProjectId="proj-a" environment={cloudEnvironment} />);
      await flushPromises();
    });
    expect(container.firstElementChild?.getAttribute("data-loaded-project")).toBe("proj-a");

    await act(async () => {
      renderWithTestLocalization(root, <CloudDataProbe explicitProjectId="proj-b" environment={cloudEnvironment} />);
      await Promise.resolve();
    });

    expect(container.firstElementChild?.getAttribute("data-active-project")).toBe("proj-b");
    expect(container.firstElementChild?.getAttribute("data-loaded-project")).toBe("none");
    expect(container.firstElementChild?.getAttribute("data-loading")).toBe("true");

    await act(async () => {
      secondProject.resolve(projects[1]);
      await flushPromises();
    });
    expect(container.firstElementChild?.getAttribute("data-loaded-project")).toBe("proj-b");
  });

  it("returns a reload promise that settles after the refresh request", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    let latestData: DesktopCloudDataState | null = null;

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudDataProbe
          explicitProjectId="proj-a"
          environment={cloudEnvironment}
          onData={(data) => { latestData = data; }}
        />,
      );
      await flushPromises();
    });

    const reloadedProject = deferred<(typeof projects)[number]>();
    getCloudProject.mockImplementationOnce(() => reloadedProject.promise);
    let settled = false;
    let reloadPromise: Promise<void> | null = null;
    await act(async () => {
      reloadPromise = latestData?.reload() ?? null;
      reloadPromise?.then(() => { settled = true; });
      await Promise.resolve();
    });
    expect(settled).toBe(false);

    await act(async () => {
      reloadedProject.resolve(projects[0]);
      await reloadPromise;
    });
    expect(settled).toBe(true);
  });

  it("ignores an older project request that finishes after the new browse context", async () => {
    const firstProject = deferred<(typeof projects)[number]>();
    getCloudProject
      .mockImplementationOnce(() => firstProject.promise)
      .mockResolvedValueOnce(projects[1]);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root, <CloudDataProbe explicitProjectId="proj-a" environment={cloudEnvironment} />);
      await Promise.resolve();
    });

    await act(async () => {
      renderWithTestLocalization(root, <CloudDataProbe explicitProjectId="proj-b" environment={cloudEnvironment} />);
      await flushPromises();
    });
    expect(container.firstElementChild?.getAttribute("data-active-project")).toBe("proj-b");

    await act(async () => {
      firstProject.resolve(projects[0]);
      await flushPromises();
    });
    expect(container.firstElementChild?.getAttribute("data-active-project")).toBe("proj-b");
  });

  it("keeps project identity available while switching to a route-scoped loader", async () => {
    const routeRefresh = deferred<(typeof projects)[number]>();
    getCloudProject
      .mockResolvedValueOnce(projects[0])
      .mockImplementationOnce(() => routeRefresh.promise);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudDataProbe
          explicitProjectId="proj-a"
          environment={cloudEnvironment}
          loadProjectDetails
        />,
      );
      await flushPromises();
    });

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudDataProbe
          explicitProjectId="proj-a"
          environment={cloudEnvironment}
          loadProjectDetails={false}
        />,
      );
      await Promise.resolve();
    });

    expect(container.firstElementChild?.getAttribute("data-active-project")).toBe("proj-a");
    expect(container.firstElementChild?.getAttribute("data-initializing")).toBe("false");
    expect(container.firstElementChild?.getAttribute("data-loading")).toBe("true");

    await act(async () => {
      routeRefresh.resolve(projects[0]);
      await flushPromises();
    });
  });

  it("loads a bound project directly without visiting the organization project list", async () => {
    listCloudProjects.mockRejectedValueOnce(new Error("projects offline"));
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudDataProbe
          explicitProjectId={null}
          boundProjectId="proj-bound"
          environment={cloudEnvironment}
        />,
      );
      await flushPromises();
    });

    expect(container.firstElementChild?.getAttribute("data-mapped-project")).toBe("proj-bound");
    expect(container.firstElementChild?.getAttribute("data-active-project")).toBe("proj-bound");
    expect(container.firstElementChild?.getAttribute("data-error")).toBe("none");
    expect(getCloudProject).toHaveBeenCalledWith(
      session,
      "proj-bound",
      expect.any(Function),
      "https://cloud.example",
    );
    expect(listCloudProjects).not.toHaveBeenCalled();
  });

  it("does not reload Project details when only the public session status refreshes", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudDataProbe
          explicitProjectId="proj-a"
          environment={cloudEnvironment}
          sessionOverride={{ ...session, status: "authenticated" } as DesktopCloudSession}
        />,
      );
      await flushPromises();
    });
    expect(getCloudProject).toHaveBeenCalledTimes(1);
    expect(getCloudProjectReadiness).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudDataProbe
          explicitProjectId="proj-a"
          environment={cloudEnvironment}
          sessionOverride={{ ...session, status: "refreshing" } as DesktopCloudSession}
        />,
      );
      await flushPromises();
    });

    expect(getCloudProject).toHaveBeenCalledTimes(1);
    expect(getCloudProjectReadiness).toHaveBeenCalledTimes(1);
  });
});

function createAggregateCloudData(
  reload: () => Promise<void>,
  overrides: Partial<DesktopCloudDataState> = {},
): DesktopCloudDataState {
  return {
    projects: [{ id: "proj-1", name: "Demo" }],
    mappedProjectId: "proj-1",
    mappedProject: { id: "proj-1", name: "Demo" },
    activeProjectId: "proj-1",
    activeProject: { id: "proj-1", name: "Demo" },
    dashboard: null,
    tree: null,
    history: null,
    scopes: [{
      id: "scope-1",
      project_id: "proj-1",
      path: "/docs",
      name: "Docs",
      max_mode: "rw",
    } as never],
    connectors: [{
      id: "conn-1",
      target: { kind: "scope", project_id: "proj-1", scope_id: "scope-1" },
      provider: "web",
      name: "Web",
    } as never],
    mcpEndpoints: [],
    identity: null,
    initializing: false,
    loading: false,
    error: null,
    warning: null,
    reload,
    ...overrides,
  };
}

function CloudDataProbe({
  explicitProjectId,
  environment,
  onData,
  loadProjectDetails = true,
  boundProjectId = null,
  sessionOverride = session,
}: {
  explicitProjectId: string | null;
  environment: CloudEnvironment;
  onData?: (data: DesktopCloudDataState) => void;
  loadProjectDetails?: boolean;
  boundProjectId?: string | null;
  sessionOverride?: DesktopCloudSession;
}) {
  const onSessionChange = React.useCallback(() => undefined, []);
  const data = useDesktopCloudData({
    session: sessionOverride,
    cloudEnvironment: environment,
    explicitProjectId,
    boundProjectId,
    onSessionChange,
    loadProjectDetails,
  });
  onData?.(data);
  return (
    <div
      data-active-project={data.activeProjectId ?? "none"}
      data-loaded-project={data.activeProject?.id ?? "none"}
      data-mapped-project={data.mappedProjectId ?? "none"}
      data-error={data.error ?? "none"}
      data-initializing={String(data.initializing)}
      data-loading={String(data.loading)}
    />
  );
}

function HomeCatalogProbe() {
  const updateSession = React.useCallback(() => undefined, []);
  const setOperationStatus = React.useCallback(() => undefined, []);
  const setRestoreError = React.useCallback(() => undefined, []);
  const noop = React.useCallback(() => undefined, []);
  const asyncNoop = React.useCallback(async () => undefined, []);
  const recentWorkspaceItems = React.useMemo(() => [], []);
  const home = useCloudProjectHome({
    activeCloudSession: session,
    autoRefreshProjectCatalog: true,
    cloudEnabled: true,
    desktopCloudApiBaseUrl: "https://cloud.example",
    includeUnboundCloudProjects: true,
    onOpenCloudProject: noop,
    recentWorkspaceItems,
    setHomeOperationStatus: setOperationStatus,
    setRestoreWorkspaceError: setRestoreError,
    showBrowserSignInStatus: noop,
    startCloudBrowserSignIn: asyncNoop,
    updateCloudSession: updateSession,
  });
  return <output data-project-count={String(home.homeCloudProjects.length)} />;
}

function CloudAccessDataProbe({ projectId }: { projectId: string | null }) {
  const onSessionChange = React.useCallback(() => undefined, []);
  const data = useDesktopCloudAccessData({
    projectId,
    cloudSession: session,
    apiBaseUrl: "https://cloud.example",
    onCloudSessionChange: onSessionChange,
  });
  return (
    <div
      data-scope-count={String(data.scopes.length)}
      data-loading={String(data.loading)}
    />
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("Local repo Cloud binding integration", () => {
  it("enters contents after a verified binding and keeps Team/Billing in the bound sidebar", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onSelectSection = vi.fn();

    await act(async () => {
      renderWithTestLocalization(root,
        <>
          <CloudServiceSidebar
            status={null}
            cloudSession={session}
            activeSection="contents"
            projectContext
            localWorkspaceContext
            onSelectSection={onSelectSection}
          />
          <CloudRouter
            workspace={{ id: "local-1", name: "Local Notes", path: "/tmp/local-notes" }}
            status={{
              remotes: [{
                name: "puppyone",
                fetchUrl: "https://cloud.example/git/proj-1.git",
                pushUrl: "https://cloud.example/git/proj-1.git",
                branches: [],
              }],
            } as GitStatusSnapshot}
            cloudSession={session}
            cloudApiBaseUrl="https://cloud.example"
            cloudRemote={{
              remote: { name: "puppyone", fetchUrl: "", pushUrl: "", branches: [] },
              rawUrl: "https://cloud.example/git/proj-1.git",
              info: { kind: "project", host: "cloud.example", origin: "https://cloud.example", displayId: "proj-1", projectId: "proj-1" },
            }}
            cloudData={createAggregateCloudData(vi.fn(async () => undefined))}
            attachment={{
              status: "resolved",
              projectId: "proj-1",
              resolutionSource: "workspace-binding",
              bindingStatus: "bound",
              target: { kind: "project_root", project_id: "proj-1" },
            }}
            activeSection="contents"
            accountEmail={session.user_email}
            accountConnected
            branchName="main"
            localChangeCount={0}
            loading={false}
            cloudBackupLoading={false}
            cloudAction={{ kind: null, projectId: null, notice: null, error: null }}
            onSessionChange={vi.fn()}
            onBackupWorkspace={vi.fn()}
            onConnectProject={vi.fn()}
            onCopyCloneCommand={vi.fn()}
            onOpenProject={vi.fn()}
            onOpenGitSettings={vi.fn()}
            onSelectProject={vi.fn()}
            onSelectSection={onSelectSection}
          />
        </>,
      );
      await flushPromises();
    });

    expect(container.textContent).toContain("History");
    expect(container.textContent).toContain("Automation");
    expect(container.textContent).toContain("Access");
    expect(container.textContent).toContain("Team");
    expect(container.textContent).toContain("Billing");
    expect(container.textContent).not.toContain("Cloud Projects");
    expect(container.textContent).not.toContain("Back up");
    expect(container.textContent).not.toContain("root scope");
    expect(container.querySelector(".desktop-cloud-sidebar-context-back")).toBeNull();
  });

  it("shows a recovery page when a remote exists but the account is not authorized", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudRouter
          workspace={{ id: "local-1", name: "Local Notes", path: "/tmp/local-notes" }}
          status={null}
          cloudSession={session}
          cloudApiBaseUrl="https://cloud.example"
          cloudRemote={{
            remote: { name: "puppyone", fetchUrl: "", pushUrl: "", branches: [] },
            rawUrl: "https://cloud.example/git/proj-secret.git",
            info: { kind: "project", host: "cloud.example", origin: "https://cloud.example", displayId: "proj-secret", projectId: "proj-secret" },
          }}
          cloudData={createAggregateCloudData(vi.fn(async () => undefined), {
            mappedProjectId: null,
            mappedProject: null,
            activeProjectId: null,
            activeProject: null,
          })}
          attachment={{
            status: "not-authorized",
            projectId: "proj-secret",
            message: cloudMessage("binding-not-authorized"),
          }}
          activeSection="overview"
          accountEmail={session.user_email}
          accountConnected
          branchName="main"
          localChangeCount={0}
          loading={false}
          cloudBackupLoading={false}
          cloudAction={{ kind: null, projectId: null, notice: null, error: null }}
          onSessionChange={vi.fn()}
          onBackupWorkspace={vi.fn()}
          onConnectProject={vi.fn()}
          onCopyCloneCommand={vi.fn()}
          onOpenProject={vi.fn()}
          onOpenGitSettings={vi.fn()}
          onSelectProject={vi.fn()}
          onSelectSection={vi.fn()}
        />,
      );
      await flushPromises();
    });

    expect(container.textContent).toContain("Cloud project unavailable");
    expect(container.textContent).toContain("You don’t have access");
    expect(container.textContent).toContain("Retry");
    expect(container.textContent).toContain("Use another account");
    expect(container.textContent).toContain("Git sync details");
    expect(container.textContent).not.toContain("Back up current folder");
    expect(container.textContent).not.toContain("root scope");
  });
});
