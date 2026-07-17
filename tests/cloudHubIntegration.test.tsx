/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cloudContextHasProject,
  resolveCloudHubSectionAfterContextChange,
  resolveCloudHubSectionForContext,
  resolveCloudProjectNavigationContext,
  resolveProjectCloudContext,
} from "../src/features/cloud/context/projectCloudContext";
import { adaptCloudAggregateToAccessData } from "../src/features/cloud/data/adaptCloudAggregateToAccessData";
import { loadCloudProjectDetails } from "../src/features/cloud/data/cloudProjectDetails";
import { CloudHistorySection } from "../src/features/cloud/sections/HistorySection";
import { CloudAutomationRouteSection } from "../src/features/cloud/sections/AutomationRouteSection";
import { CloudServiceSidebar } from "../src/features/cloud/CloudServiceSidebar";
import { CloudServiceMainView } from "../src/features/cloud/CloudServiceMainView";
import { CloudLocalOnlyWorkspace } from "../src/features/cloud/states";
import { useCloudAuthController } from "../src/features/cloud/hooks/useCloudAuthController";
import { useCloudProjectHome } from "../src/features/cloud/hooks/useCloudProjectHome";
import { CloudProjectBrowser } from "../src/features/cloud/components/ProjectBrowser";
import { CloudRouter } from "../src/features/cloud/routes/CloudRouter";
import {
  useDesktopCloudData,
  type DesktopCloudDataState,
} from "../src/features/cloud/data/useDesktopCloudData";
import { useCloudProjectCatalog } from "../src/features/cloud/data/useCloudProjectCatalog";
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
const createCloudProject = vi.fn();
const listCloudOrganizations = vi.fn().mockResolvedValue([
  { id: "org-1", name: "Example Org", slug: "example", plan: "free", seat_limit: 1, created_at: "2026-01-01" },
]);

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
    createCloudProject: (...args: unknown[]) => createCloudProject(...args),
    listCloudOrganizations: (...args: unknown[]) => listCloudOrganizations(...args),
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

function testCloudAuthState(value: DesktopCloudSession | null) {
  return value
    ? { status: "signed-in" as const, apiBaseUrl: value.api_base_url, session: value }
    : { status: "signed-out" as const, apiBaseUrl: null };
}

function testCloudEnvironment(apiBaseUrl: string | null): CloudEnvironment {
  return resolveCloudEnvironment({ status: null, desktopApiBaseUrl: apiBaseUrl });
}

function testCloudMainState(value: DesktopCloudSession | null, apiBaseUrl: string | null) {
  return {
    cloudEnvironment: testCloudEnvironment(apiBaseUrl),
    cloudAuthState: testCloudAuthState(value),
    cloudPublishError: null,
    cloudPublishNotice: null as const,
    cloudPublishState: null,
    cloudPublishStateLoading: false,
    onAbandonPuppyoneBackup: vi.fn(),
  };
}

describe("Cloud environment endpoint precedence", () => {
  it("keeps the configured API but ignores a legacy access-key remote as Cloud context", () => {
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
    expect(environment.cloudRemote).toBeNull();
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

describe("Project Cloud repository context semantics", () => {
  it("does not infer offline from an already authorized repository context", () => {
    const context = resolveProjectCloudContext({
      resolvedProjectId: "proj-1",
      remoteProjectId: null,
      contextError: null,
      hasCanonicalRemote: true,
      target: { kind: "project_root", project_id: "proj-1" },
      resolving: false,
    });
    expect(context).toEqual({
      status: "resolved",
      projectId: "proj-1",
      target: { kind: "project_root", project_id: "proj-1" },
    });
    expect(cloudContextHasProject(context)).toBe(true);
  });

  it("keeps an exact Project context while preserving a structured warning", () => {
    const warning = cloudMessage("remote-network-failed");
    const context = resolveProjectCloudContext({
      resolvedProjectId: "proj-err",
      remoteProjectId: null,
      contextError: warning,
      contextReason: "network",
      hasCanonicalRemote: true,
      target: { kind: "project_root", project_id: "proj-err" },
      resolving: false,
    });
    expect(context).toEqual({
      status: "resolved",
      projectId: "proj-err",
      target: { kind: "project_root", project_id: "proj-err" },
      warning,
    });
    expect(cloudContextHasProject(context)).toBe(true);
  });

  it("resets Cloud Hub section when switching Project context → local-only", () => {
    expect(resolveCloudHubSectionForContext({
      status: "resolved",
      projectId: "a",
      target: { kind: "project_root", project_id: "a" },
    })).toBe("contents");
    expect(resolveCloudHubSectionForContext({ status: "local-only", projectId: null })).toBe("initialize");
    expect(resolveCloudHubSectionForContext({
      status: "error",
      projectId: null,
      message: "boom",
    })).toBe("initialize");
  });

  it("keeps an already resolved Project in project navigation", () => {
    const degradedContext = {
      status: "resolved" as const,
      projectId: "proj-known",
      target: { kind: "project_root" as const, project_id: "proj-known" },
      warning: cloudMessage("remote-network-failed"),
    };

    expect(resolveCloudProjectNavigationContext(degradedContext)).toEqual({
      projectContext: true,
      localWorkspaceContext: true,
    });
  });

  it("does not let context refresh overwrite an explicit Project route", () => {
    expect(resolveCloudHubSectionAfterContextChange({
      currentSection: "access",
      hasProjectContext: true,
      workspaceChanged: false,
    })).toBe("access");
    expect(resolveCloudHubSectionAfterContextChange({
      currentSection: "initialize",
      hasProjectContext: true,
      workspaceChanged: false,
    })).toBe("initialize");
    expect(resolveCloudHubSectionAfterContextChange({
      currentSection: "history",
      hasProjectContext: false,
      workspaceChanged: false,
    })).toBe("initialize");
    expect(resolveCloudHubSectionAfterContextChange({
      currentSection: "templates",
      hasProjectContext: false,
      workspaceChanged: false,
    })).toBe("templates");
  });
});

describe("CloudServiceSidebar project context", () => {
  it("previews locked project sections without an Initialize nav item for a local-only workspace", () => {
    const onSelectSection = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderWithTestLocalization(root,
      <CloudServiceSidebar
        cloudAuthState={testCloudAuthState(null)}
        activeSection="initialize"
        localOnlyWorkspaceContext
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
    expect(rows.every((row) => row.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(rows.every((row) => !row.classList.contains("active"))).toBe(true);
    expect(rows[3]?.getAttribute("title")).toBe("Initialize a Cloud project to use this");

    act(() => rows[3]?.click());
    expect(onSelectSection).not.toHaveBeenCalled();
  });

  it("previews the project workspace navigation while signed out", () => {
    const onSelectSection = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderWithTestLocalization(root,
      <CloudServiceSidebar
        cloudAuthState={testCloudAuthState(null)}
        activeSection="projects"
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

  it("does not treat a stale route as an authorized Project context", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderWithTestLocalization(root,
      <CloudServiceSidebar
        cloudAuthState={testCloudAuthState(session)}
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
        cloudAuthState={testCloudAuthState(session)}
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
        cloudAuthState={testCloudAuthState(session)}
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
        cloudAuthState={testCloudAuthState(session)}
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
        cloudAuthState={testCloudAuthState(session)}
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
        cloudAuthState={testCloudAuthState(session)}
        activeSection="contents"
        projectContext
        localWorkspaceContext={false}
        onSelectSection={vi.fn()}
      />,
    ));
    expect(container.querySelector('[aria-label="Cloud project sections"]')).not.toBeNull();

    act(() => renderWithTestLocalization(root,
      <CloudServiceSidebar
        cloudAuthState={testCloudAuthState(session)}
        activeSection="projects"
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
  it("leaves the local-only Initialize screen to its single MainView owner", async () => {
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
            contextProjectId: null,
            contextProject: null,
            activeProjectId: "proj-preview",
            activeProject: { id: "proj-preview", name: "Preview Project" },
          })}
          activeSection="initialize"
          accountEmail={session.user_email}
          accountConnected
          loading={false}
          onSessionChange={vi.fn()}
          onOpenProject={vi.fn()}
          onOpenGitSettings={vi.fn()}
          onSelectSection={vi.fn()}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getCloudHistory).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Select a Cloud project to open this section.");
    expect(container.textContent).not.toContain("Initialize this project on PuppyOne Cloud");
    expect(container.querySelector(".desktop-cloud-publish-hero")).toBeNull();
    expect(container.textContent).not.toContain("Preview Project");
    expect(container.textContent).not.toContain("Repository Git remote");
  });

  it("keeps Cloud Projects as a browse-only global route beside Initialize", async () => {
    listCloudRoot.mockResolvedValue({ entries: [] });
    listCloudProjects.mockResolvedValue([{ id: "proj-preview", name: "Preview Project" }]);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudServiceMainView
          {...testCloudMainState(session, "https://cloud.example")}
          workspace={{ id: "local-1", name: "Local Notes", path: "/tmp/local-notes" }}
          status={null}
          projectContext={{ status: "local-only", projectId: null }}
          onCloudSessionChange={vi.fn()}
          activeSection="projects"
          loading={false}
          error={null}
          cloudBackupLoading={false}
          cloudBackupPending={false}
          onStartPuppyoneBackup={vi.fn()}
          onOpenGitSettings={vi.fn()}
          onSelectSection={vi.fn()}
          onRefresh={vi.fn()}
        />,
      );
      await flushPromises();
    });

    expect(container.textContent).toContain("Preview Project");
    expect(container.textContent).not.toContain("Initialize this project");
    expect(container.querySelector(".desktop-project-folder-new-card")).toBeNull();
    expect(container.querySelector(".desktop-project-folder-card-action")).toBeNull();

  });

});

describe("Cloud Project selection actions", () => {
  it("keeps catalog previews while limiting tree reads to three concurrent requests", async () => {
    const projects = Array.from({ length: 7 }, (_, index) => ({
      id: `concurrency-project-${index}`,
      name: `Project ${index}`,
      updated_at: `2026-07-16T00:00:0${index}Z`,
    }));
    const gates = new Map(projects.map((project) => [project.id, deferred<void>()]));
    let active = 0;
    let maxActive = 0;
    listCloudRoot.mockImplementation(async (_session: unknown, projectId: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gates.get(projectId)?.promise;
      active -= 1;
      return { entries: [] };
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudProjectBrowser
          projects={projects}
          loading={false}
          session={session}
          apiBaseUrl="https://cloud.example"
          currentRepositoryProjectId={null}
          backupLoading={false}
          cloudAction={{ kind: null, projectId: null }}
          onSessionChange={vi.fn()}
          onBackupWorkspace={vi.fn()}
          onSelectProject={vi.fn()}
          onConfigureProjectRemote={vi.fn()}
          onOpenCloudProjects={vi.fn()}
          showRepositoryActions={false}
        />,
      );
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(listCloudRoot).toHaveBeenCalledTimes(3));
    expect(maxActive).toBe(3);

    await act(async () => {
      gates.forEach((gate) => gate.resolve());
      await flushPromises();
    });
    await vi.waitFor(() => expect(listCloudRoot).toHaveBeenCalledTimes(7));
    expect(maxActive).toBe(3);
  });

  it("disables every competing remote/create action while one remote is being configured", async () => {
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
          currentRepositoryProjectId={null}
          backupLoading={false}
          cloudAction={{ kind: "configure-remote", projectId: "proj-a" }}
          onSessionChange={vi.fn()}
          onBackupWorkspace={vi.fn()}
          onSelectProject={vi.fn()}
          onConfigureProjectRemote={vi.fn()}
          onOpenCloudProjects={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    const remoteButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".desktop-project-folder-card-action"),
    );
    expect(remoteButtons).toHaveLength(2);
    expect(remoteButtons.every((button) => button.disabled)).toBe(true);
    expect(container.querySelector<HTMLButtonElement>(".desktop-project-folder-new-card")?.disabled).toBe(true);
  });
});

describe("Local-only Cloud page", () => {
  it("automatically continues a signed-out publish intent when the account has one organization", async () => {
    const onStartPuppyoneBackup = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudServiceMainView
          {...testCloudMainState(session, "https://cloud.example")}
          workspace={{ id: "local-one-org", name: "Local Notes", path: "/tmp/local-one-org" }}
          status={{
            isRepo: true,
            branch: "main",
            headCommitId: "head-1",
            totalCommits: 1,
            entries: [],
            branches: [],
            stagedEntries: [],
            unstagedEntries: [],
            untrackedEntries: [],
            remotes: [],
          } as unknown as GitStatusSnapshot}
          projectContext={{ status: "local-only", projectId: null }}
          onCloudSessionChange={vi.fn()}
          activeSection="initialize"
          loading={false}
          error={null}
          cloudBackupLoading={false}
          cloudBackupPending
          onStartPuppyoneBackup={onStartPuppyoneBackup}
          onSelectSection={vi.fn()}
          onRefresh={vi.fn()}
          onOpenGitSettings={vi.fn()}
        />,
      );
      await flushPromises();
    });

    await vi.waitFor(() => expect(onStartPuppyoneBackup).toHaveBeenCalledWith("org-1"));
  });

  it("requires an explicit organization before continuing a multi-organization publish intent", async () => {
    listCloudOrganizations.mockResolvedValueOnce([
      { id: "org-1", name: "First Org", slug: "first", plan: "free", seat_limit: 1, created_at: "2026-01-01" },
      { id: "org-2", name: "Second Org", slug: "second", plan: "free", seat_limit: 1, created_at: "2026-01-01" },
    ]);
    const onStartPuppyoneBackup = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudServiceMainView
          {...testCloudMainState(session, "https://cloud.example")}
          workspace={{ id: "local-multi-org", name: "Local Notes", path: "/tmp/local-multi-org" }}
          status={{
            isRepo: true,
            branch: "main",
            headCommitId: "head-1",
            totalCommits: 1,
            entries: [],
            branches: [],
            stagedEntries: [],
            unstagedEntries: [],
            untrackedEntries: [],
            remotes: [],
          } as unknown as GitStatusSnapshot}
          projectContext={{ status: "local-only", projectId: null }}
          onCloudSessionChange={vi.fn()}
          activeSection="initialize"
          loading={false}
          error={null}
          cloudBackupLoading={false}
          cloudBackupPending
          onStartPuppyoneBackup={onStartPuppyoneBackup}
          onSelectSection={vi.fn()}
          onRefresh={vi.fn()}
          onOpenGitSettings={vi.fn()}
        />,
      );
      await flushPromises();
    });

    await vi.waitFor(() => expect(container.querySelector("select")).not.toBeNull());
    expect(onStartPuppyoneBackup).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>(".desktop-cloud-publish-primary")?.disabled).toBe(true);

    await act(async () => {
      const selector = container.querySelector<HTMLSelectElement>("select");
      if (selector) {
        selector.value = "org-2";
        selector.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".desktop-cloud-publish-primary")?.click();
    });
    expect(onStartPuppyoneBackup).toHaveBeenCalledWith("org-2");
  });

  it("shows the canonical Cloud main destination when the local branch has another name", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderWithTestLocalization(root,
      <CloudLocalOnlyWorkspace
        workspace={{ id: "local-feature", name: "Feature Repo", path: "/tmp/feature-repo" }}
        accountEmail="owner@example.com"
        branchName="feature/cloud-ux"
        totalCommits={3}
        localChangeCount={0}
        isGitRepository
        hasHeadCommit
        hasCurrentBranch
        publishLoading={false}
        onPublishWorkspace={vi.fn()}
      />,
    ));

    const localDetails = container.querySelector(".desktop-cloud-publish-details.local");
    const cloudDetails = container.querySelector(".desktop-cloud-publish-details.cloud");
    expect(localDetails?.textContent).toContain("feature/cloud-ux");
    expect(cloudDetails?.textContent).toContain("main");
    expect(container.querySelector(".desktop-cloud-publish-summary")).toBeNull();
  });

  it("shows explicit browser sign-in feedback while a publish intent is pending", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudLocalOnlyWorkspace
          workspace={{ id: "local-pending", name: "Local Notes", path: "/tmp/local-notes" }}
          accountEmail={null}
          branchName="main"
          totalCommits={1}
          localChangeCount={1}
          isGitRepository
          hasHeadCommit
          hasCurrentBranch
          publishLoading={false}
          publishPending
          publishError={null}
          onPublishWorkspace={vi.fn()}
        />,
      );
      await flushPromises();
    });

    expect(container.textContent).toContain("Finish signing in in your browser");
    expect(container.textContent).toContain("Waiting for sign-in…");
    const primaryAction = container.querySelector<HTMLButtonElement>(".desktop-cloud-publish-primary");
    expect(primaryAction?.disabled).toBe(true);
    expect(primaryAction?.getAttribute("aria-busy")).toBe("true");
  });

  it("marks truncated Git status counts in the local details without an extra summary", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderWithTestLocalization(root,
      <CloudLocalOnlyWorkspace
        workspace={{ id: "local-many", name: "Large Repo", path: "/tmp/large-repo" }}
        accountEmail="owner@example.com"
        branchName="main"
        totalCommits={12}
        localChangeCount={1000}
        localChangeCountIsMinimum
        isGitRepository
        hasHeadCommit
        hasCurrentBranch
        publishLoading={false}
        onPublishWorkspace={vi.fn()}
      />,
    ));

    expect(container.textContent).toContain("At least 1,000 local changes");
    expect(container.querySelector(".desktop-cloud-publish-summary")).toBeNull();
  });

  it("renders coordinator state and resumes the same interrupted publish", () => {
    const onPublishWorkspace = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderWithTestLocalization(root,
      <CloudLocalOnlyWorkspace
        workspace={{ id: "local-retry", name: "Retry Repo", path: "/tmp/retry-repo" }}
        accountEmail="owner@example.com"
        branchName="main"
        totalCommits={2}
        localChangeCount={0}
        isGitRepository
        hasHeadCommit
        hasCurrentBranch
        publishLoading={false}
        publishError={{ code: "PUSH_FAILED", retryable: true }}
        publishState={{
          operationId: "11111111-1111-4111-8111-111111111111",
          phase: "remote-configured",
          projectId: "proj-retry",
          projectName: "Retry Repo",
          organizationId: "org-1",
          expectedHeadCommitId: "head-1",
          expectedBranch: "main",
          destinationBranch: "main",
          createdAt: "2026-07-16T00:00:00Z",
          updatedAt: "2026-07-16T00:01:00Z",
          canResume: true,
          canAbandon: true,
        }}
        onAbandonPublish={vi.fn()}
        onPublishWorkspace={onPublishWorkspace}
      />,
    ));

    expect(container.textContent).toContain("Git remote configured");
    const retry = container.querySelector<HTMLButtonElement>(".desktop-cloud-publish-primary");
    expect(retry?.textContent).toBe("Resume");
    act(() => retry?.click());
    expect(onPublishWorkspace).toHaveBeenCalledOnce();
  });

  it("renders a publish failure exactly once on the Initialize page", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudServiceMainView
          {...testCloudMainState(session, "https://cloud.example")}
          cloudPublishError={{ code: "PUSH_FAILED", retryable: true }}
          workspace={{ id: "local-error", name: "Local Error", path: "/tmp/local-error" }}
          status={{
            isRepo: true,
            branch: "main",
            headCommitId: "head-1",
            totalCommits: 1,
            entries: [],
            branches: [],
            stagedEntries: [],
            unstagedEntries: [],
            untrackedEntries: [],
            remotes: [],
          } as unknown as GitStatusSnapshot}
          projectContext={{ status: "local-only", projectId: null }}
          onCloudSessionChange={vi.fn()}
          activeSection="initialize"
          loading={false}
          error={null}
          cloudBackupLoading={false}
          cloudBackupPending={false}
          onStartPuppyoneBackup={vi.fn()}
          onSelectSection={vi.fn()}
          onRefresh={vi.fn()}
          onOpenGitSettings={vi.fn()}
        />,
      );
      await flushPromises();
    });

    const publishFailure = "Unable to publish this project to PuppyOne Cloud.";
    expect(Array.from(container.querySelectorAll(".desktop-cloud-main-alert"))
      .filter((alert) => alert.textContent === publishFailure)).toHaveLength(1);
  });

  it("shows Git status loading and real failures instead of treating an unknown status as a folder", async () => {
    const onRefresh = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const commonProps = {
      ...testCloudMainState(null, "http://localhost:9090"),
      workspace: { id: "local-loading", name: "Loading Repo", path: "/tmp/loading-repo" },
      cloudApiBaseUrl: "http://localhost:9090",
      cloudSession: null,
      projectContext: { status: "resolving" as const, projectId: null },
      onCloudSessionChange: vi.fn(),
      activeSection: "initialize" as const,
      cloudBackupLoading: false,
      cloudBackupPending: false,
      cloudBackupError: null,
      onStartPuppyoneBackup: vi.fn(),
      onSelectSection: vi.fn(),
      onRefresh,
      onOpenGitSettings: vi.fn(),
    };

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudServiceMainView {...commonProps} status={null} loading error={null} />,
      );
      await flushPromises();
    });
    expect(container.textContent).toContain("Reading Git repository…");
    expect(container.textContent).not.toContain("Local folder");

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudServiceMainView
          {...commonProps}
          status={null}
          projectContext={{ status: "local-only", projectId: null }}
          loading={false}
          error="fatal: cannot read repository"
        />,
      );
      await flushPromises();
    });
    expect(container.textContent).toContain("Unable to read this Git repository");
    expect(container.textContent).toContain("fatal: cannot read repository");
    const retry = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("Retry"));
    act(() => retry?.click());
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it.each([null, "HEAD", "detached"])("blocks initialize for detached branch marker %s", (branch) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => renderWithTestLocalization(root,
      <CloudServiceMainView
        {...testCloudMainState(null, "http://localhost:9090")}
        workspace={{ id: "local-detached", name: "Detached Repo", path: "/tmp/detached-repo" }}
        status={{
          isRepo: true,
          branch,
          headCommitId: "head-1",
          totalCommits: 1,
          entries: [],
          branches: [],
          stagedEntries: [],
          unstagedEntries: [],
          untrackedEntries: [],
          remotes: [],
          didHitStatusLimit: false,
        } as unknown as GitStatusSnapshot}
        cloudApiBaseUrl="http://localhost:9090"
        cloudSession={null}
        projectContext={{ status: "local-only", projectId: null }}
        onCloudSessionChange={vi.fn()}
        activeSection="initialize"
        loading={false}
        error={null}
        cloudBackupLoading={false}
        cloudBackupPending={false}
        cloudBackupError={null}
        onStartPuppyoneBackup={vi.fn()}
        onSelectSection={vi.fn()}
        onRefresh={vi.fn()}
        onOpenGitSettings={vi.fn()}
      />,
    ));

    expect(container.textContent).toContain("Check out a branch before pushing to Cloud.");
    expect(container.querySelector<HTMLButtonElement>(".desktop-cloud-publish-primary")?.disabled).toBe(true);
  });

  it("renders the Initialize/Push flow from live Git state without inferring a Cloud Project", async () => {
    const localSession = {
      ...session,
      api_base_url: "http://localhost:9090",
    } as DesktopCloudSession;
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudServiceMainView
          {...testCloudMainState(localSession, "http://localhost:9090")}
          workspace={{
            id: "local-1",
            name: "Local Notes",
            path: "/tmp/local-notes",
            workspaceInstanceId: "workspace-instance-1",
          }}
          status={{
            isRepo: true,
            branch: "main",
            headCommitId: "head-18",
            totalCommits: 18,
            entries: [
              { path: "one", oldPath: null, staged: null, unstaged: "M", status: "M" },
              { path: "two", oldPath: null, staged: null, unstaged: "M", status: "M" },
              { path: "three", oldPath: null, staged: null, unstaged: "M", status: "M" },
              { path: "four", oldPath: null, staged: null, unstaged: "M", status: "M" },
              { path: "five", oldPath: null, staged: null, unstaged: "M", status: "M" },
            ],
            branches: [],
            stagedEntries: [],
            unstagedEntries: [],
            untrackedEntries: [],
            remotes: [],
            didHitStatusLimit: true,
          } as unknown as GitStatusSnapshot}
          cloudApiBaseUrl="http://localhost:9090"
          cloudSession={localSession}
          projectContext={{ status: "local-only", projectId: null }}
          onCloudSessionChange={vi.fn()}
          activeSection="initialize"
          loading={false}
          error={null}
          cloudBackupLoading={false}
          cloudBackupPending={false}
          cloudBackupError={null}
          onStartPuppyoneBackup={vi.fn()}
          onSelectSection={vi.fn()}
          onRefresh={vi.fn()}
          onOpenGitSettings={vi.fn()}
        />,
      );
      await flushPromises();
    });

    expect(container.textContent).toContain("Local Notes");
    expect(container.textContent).toContain("18 commits");
    expect(container.textContent).toContain("At least 5 local changes");
    expect(container.querySelector(".desktop-cloud-publish-details.local")?.textContent)
      .toContain("Local Notes");
    expect(container.querySelector(".desktop-cloud-publish-details.cloud")?.textContent)
      .toContain("New Cloud project");
    expect(container.querySelector(".desktop-cloud-publish-symbol.local")?.getAttribute("aria-label"))
      .toBe("Local Git repository");
    expect(container.querySelector(".desktop-cloud-publish-symbol.cloud")?.getAttribute("aria-label"))
      .toBe("PuppyOne Cloud");
    expect(container.querySelector(".desktop-cloud-publish-summary")).toBeNull();
    expect(container.textContent).toContain("New Cloud project");
    expect(container.textContent).toContain("Not initialized");
    expect(container.textContent).toContain("Initialize and Push");
    expect(container.querySelector(".desktop-cloud-publish-arrow")?.getAttribute("aria-label")).toBe("Push");
    expect(container.querySelector(".desktop-cloud-publish-arrow")?.textContent?.trim()).toBe("");
    expect(container.textContent).not.toContain("Git push");
    expect(container.textContent).not.toContain("Unable to verify");
    expect(container.querySelector(".desktop-cloud-main-alert")).toBeNull();
    expect(getCloudProject).not.toHaveBeenCalled();
  });

  it("stays passive while signed out, then forwards an explicit publish intent", async () => {
    const restoreCloudSession = vi.fn().mockResolvedValue(null);
    const onStartPuppyoneBackup = vi.fn();
    const previousBridge = window.puppyoneDesktop;
    Object.defineProperty(window, "puppyoneDesktop", {
      configurable: true,
      value: { restoreCloudSession },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudServiceMainView
          {...testCloudMainState(null, "http://localhost:9090")}
          workspace={{
            id: "local-signed-out",
            name: "Local Notes",
            path: "/tmp/local-notes",
            workspaceInstanceId: "workspace-instance-local",
          }}
          status={{
            isRepo: true,
            branch: "main",
            headCommitId: "head-1",
            totalCommits: 1,
            entries: [],
            branches: [],
            stagedEntries: [],
            unstagedEntries: [],
            untrackedEntries: [],
            remotes: [],
          } as unknown as GitStatusSnapshot}
          cloudApiBaseUrl="http://localhost:9090"
          cloudSession={null}
          projectContext={{ status: "local-only", projectId: null }}
          onCloudSessionChange={vi.fn()}
          activeSection="initialize"
          loading={false}
          error={null}
          cloudBackupLoading={false}
          cloudBackupPending={false}
          cloudBackupError={null}
          onStartPuppyoneBackup={onStartPuppyoneBackup}
          onSelectSection={vi.fn()}
          onRefresh={vi.fn()}
          onOpenGitSettings={vi.fn()}
        />,
      );
      await flushPromises();
    });

    expect(container.querySelector(".desktop-cloud-publish-hero")).not.toBeNull();
    expect(container.textContent).toContain("Sign in to Initialize");
    expect(container.querySelector(".desktop-cloud-main-alert")).toBeNull();
    expect(restoreCloudSession).not.toHaveBeenCalled();
    expect(getCloudProject).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".desktop-cloud-publish-primary")?.click();
    });
    expect(onStartPuppyoneBackup).toHaveBeenCalledOnce();

    Object.defineProperty(window, "puppyoneDesktop", {
      configurable: true,
      value: previousBridge,
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
  it("does not enable Access loading for Local workspaces even with a repository Project context", async () => {
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

  it("loads only the identity and readiness resources required by the Claude route", async () => {
    const identity = { project_id: "proj-1", remote_url: "https://cloud.example/git/proj-1.git" };
    const readiness = {
      project_id: "proj-1",
      git: { state: "ready" },
      claude: { ready: true, blockers: [] },
    };
    getCloudRepoIdentity.mockResolvedValue(identity);
    getCloudProjectReadiness.mockResolvedValue(readiness);

    const details = await loadCloudProjectDetails({
      session,
      projectId: "proj-1",
      projects: [{ id: "proj-1", name: "Demo" }],
      onSessionChange: vi.fn(),
      cloudApiBaseUrl: "https://cloud.example",
      resources: ["identity", "readiness"],
    });

    expect(details.identity).toBe(identity);
    expect(details.readiness).toBe(readiness);
    expect(getCloudRepoIdentity).toHaveBeenCalledOnce();
    expect(getCloudProjectReadiness).toHaveBeenCalledOnce();
    expect(getCloudDashboard).not.toHaveBeenCalled();
    expect(listCloudRoot).not.toHaveBeenCalled();
    expect(getCloudHistory).not.toHaveBeenCalled();
    expect(listCloudScopes).not.toHaveBeenCalled();
    expect(listCloudConnectors).not.toHaveBeenCalled();
    expect(listCloudMcpEndpoints).not.toHaveBeenCalled();
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

  it("reuses the same Project-create idempotency key after a retry", async () => {
    createCloudProject
      .mockRejectedValueOnce(new Error("temporary create failure"))
      .mockResolvedValueOnce({ id: "project-created", name: "Untitled Project" });
    const onOpen = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root, <HomeCreateProbe onOpen={onOpen} />);
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="open-create"]')?.click();
      await Promise.resolve();
    });
    expect(container.firstElementChild?.getAttribute("data-dialog-open")).toBe("true");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="submit-create"]')?.click();
      await flushPromises();
    });
    expect(container.firstElementChild?.getAttribute("data-dialog-open")).toBe("true");
    expect(container.firstElementChild?.getAttribute("data-error")).toContain("temporary create failure");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-action="submit-create"]')?.click();
      await flushPromises();
    });

    expect(createCloudProject).toHaveBeenCalledTimes(2);
    expect(createCloudProject.mock.calls[0]?.[1]).toEqual({
      name: "Untitled Project",
      description: null,
      org_id: "org-1",
    });
    expect(createCloudProject.mock.calls[0]?.[2]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(createCloudProject.mock.calls[1]?.[2]).toBe(createCloudProject.mock.calls[0]?.[2]);
    expect(onOpen).toHaveBeenCalledWith({ id: "project-created", name: "Untitled Project" });
    expect(container.firstElementChild?.getAttribute("data-dialog-open")).toBe("false");
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
      name: projectId === "proj-context" ? "Context Project" : projectId,
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

  it("loads the organization Project catalog only through its global owner", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root, <CloudCatalogProbe />);
      await flushPromises();
    });

    expect(listCloudProjects).toHaveBeenCalledOnce();
    expect(container.querySelector("output")?.getAttribute("data-project-count")).toBe("2");
    expect(getCloudProject).not.toHaveBeenCalled();
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

  it("loads a repository-resolved Project directly without visiting the organization project list", async () => {
    listCloudProjects.mockRejectedValueOnce(new Error("projects offline"));
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root,
        <CloudDataProbe
          explicitProjectId={null}
          repositoryProjectId="proj-context"
          environment={cloudEnvironment}
        />,
      );
      await flushPromises();
    });

    expect(container.firstElementChild?.getAttribute("data-context-project")).toBe("proj-context");
    expect(container.firstElementChild?.getAttribute("data-active-project")).toBe("proj-context");
    expect(container.firstElementChild?.getAttribute("data-error")).toBe("none");
    expect(getCloudProject).toHaveBeenCalledWith(
      session,
      "proj-context",
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
    contextProjectId: "proj-1",
    contextProject: { id: "proj-1", name: "Demo" },
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
  repositoryProjectId = null,
  sessionOverride = session,
}: {
  explicitProjectId: string | null;
  environment: CloudEnvironment;
  onData?: (data: DesktopCloudDataState) => void;
  loadProjectDetails?: boolean;
  repositoryProjectId?: string | null;
  sessionOverride?: DesktopCloudSession;
}) {
  const onSessionChange = React.useCallback(() => undefined, []);
  const data = useDesktopCloudData({
    session: sessionOverride,
    cloudEnvironment: environment,
    explicitProjectId,
    repositoryProjectId,
    onSessionChange,
    loadProjectDetails,
  });
  onData?.(data);
  return (
    <div
      data-active-project={data.activeProjectId ?? "none"}
      data-loaded-project={data.activeProject?.id ?? "none"}
      data-context-project={data.contextProjectId ?? "none"}
      data-error={data.error ?? "none"}
      data-initializing={String(data.initializing)}
      data-loading={String(data.loading)}
    />
  );
}

function CloudCatalogProbe() {
  const onSessionChange = React.useCallback(() => undefined, []);
  const data = useCloudProjectCatalog({
    enabled: true,
    session,
    apiBaseUrl: "https://cloud.example",
    onSessionChange,
  });
  return <output data-project-count={String(data.projects.length)} data-loading={String(data.loading)} />;
}

function HomeCatalogProbe() {
  const updateSession = React.useCallback(() => undefined, []);
  const setOperationStatus = React.useCallback(() => undefined, []);
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
    showBrowserSignInStatus: noop,
    startCloudBrowserSignIn: asyncNoop,
    updateCloudSession: updateSession,
  });
  return <output data-project-count={String(home.homeCloudProjects.length)} />;
}

function HomeCreateProbe({ onOpen }: { onOpen: (project: { id: string; name: string }) => void }) {
  const updateSession = React.useCallback(() => undefined, []);
  const noop = React.useCallback(() => undefined, []);
  const asyncNoop = React.useCallback(async () => true, []);
  const recentWorkspaceItems = React.useMemo(() => [], []);
  const [operationStatus, setOperationStatus] = React.useState<unknown>(null);
  const home = useCloudProjectHome({
    activeCloudSession: session,
    autoRefreshProjectCatalog: false,
    autoResolveRecentWorkspaceContexts: false,
    cloudEnabled: true,
    desktopCloudApiBaseUrl: "https://cloud.example",
    includeUnboundCloudProjects: true,
    onOpenCloudProject: onOpen as never,
    recentWorkspaceItems,
    setHomeOperationStatus: setOperationStatus as never,
    showBrowserSignInStatus: noop,
    startCloudBrowserSignIn: asyncNoop,
    updateCloudSession: updateSession,
  });
  return (
    <div
      data-dialog-open={String(home.homeCloudProjectCreateDialogOpen)}
      data-submitting={String(home.homeCloudProjectCreateSubmitting)}
      data-error={home.homeCloudProjectCreateError ?? ""}
      data-operation={String(Boolean(operationStatus))}
    >
      <button type="button" data-action="open-create" onClick={() => void home.createCloudProjectFromHomepage()}>
        Open create
      </button>
      <button type="button" data-action="submit-create" onClick={() => void home.submitHomeCloudProjectCreate("org-1")}>
        Submit create
      </button>
    </div>
  );
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

describe("Local repository Cloud context integration", () => {
  it("enters contents after Project authorization and keeps Team/Billing in the Project sidebar", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onSelectSection = vi.fn();

    await act(async () => {
      renderWithTestLocalization(root,
        <>
          <CloudServiceSidebar
            cloudAuthState={testCloudAuthState(session)}
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
            projectContext={{
              status: "resolved",
              projectId: "proj-1",
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
            contextProjectId: null,
            contextProject: null,
            activeProjectId: null,
            activeProject: null,
          })}
          projectContext={{
            status: "not-authorized",
            projectId: "proj-secret",
            message: cloudMessage("remote-not-authorized"),
          }}
          activeSection="initialize"
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
    expect(container.textContent).not.toContain("Publish this project");
    expect(container.textContent).not.toContain("root scope");
  });
});
