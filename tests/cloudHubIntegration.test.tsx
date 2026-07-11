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
import { useCloudAuthController } from "../src/features/cloud/hooks/useCloudAuthController";
import { CloudProjectBrowser } from "../src/features/cloud/components/ProjectBrowser";
import { CloudRouter } from "../src/features/cloud/routes/CloudRouter";
import {
  useDesktopCloudData,
  type DesktopCloudDataState,
} from "../src/features/cloud/data/useDesktopCloudData";
import { useDesktopCloudAccessData } from "../src/features/cloud/data/useDesktopCloudAccessData";
import { resolveCloudEnvironment, type CloudEnvironment } from "../src/features/cloud/environment";
import type { DesktopCloudScope, DesktopCloudSession } from "../src/lib/cloudApi";
import type { GitStatusSnapshot } from "../src/types/electron";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getCloudHistory = vi.fn();
const listCloudAutomationProviderSpecs = vi.fn();
const listCloudScopes = vi.fn();
const listCloudConnectors = vi.fn();
const listCloudMcpEndpoints = vi.fn();
const getCloudRepoIdentity = vi.fn();
const getCloudDashboard = vi.fn();
const listCloudRoot = vi.fn();
const listCloudProjects = vi.fn();

vi.mock("../src/lib/cloudApi", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/cloudApi")>("../src/lib/cloudApi");
  return {
    ...actual,
    getCloudHistory: (...args: unknown[]) => getCloudHistory(...args),
    listCloudAutomationProviderSpecs: (...args: unknown[]) => listCloudAutomationProviderSpecs(...args),
    listCloudScopes: (...args: unknown[]) => listCloudScopes(...args),
    listCloudConnectors: (...args: unknown[]) => listCloudConnectors(...args),
    listCloudMcpEndpoints: (...args: unknown[]) => listCloudMcpEndpoints(...args),
    getCloudRepoIdentity: (...args: unknown[]) => getCloudRepoIdentity(...args),
    getCloudDashboard: (...args: unknown[]) => getCloudDashboard(...args),
    listCloudRoot: (...args: unknown[]) => listCloudRoot(...args),
    listCloudProjects: (...args: unknown[]) => listCloudProjects(...args),
    openCloudApp: vi.fn(),
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
      root?.render(<AuthHarness />);
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
      configuredProjectId: "proj-1",
      bindingProjectId: null,
      remoteProjectId: null,
      bindingError: null,
      bindingCloudLinked: true,
      resolving: false,
    });
    expect(attachment).toEqual({ status: "linked", projectId: "proj-1" });
    expect(isProjectCloudLinked(attachment)).toBe(true);
  });

  it("keeps a known project structurally linked while preserving a resolver warning", () => {
    const attachment = resolveProjectCloudAttachment({
      configuredProjectId: null,
      bindingProjectId: "proj-err",
      remoteProjectId: null,
      bindingError: "Mapping failed",
      bindingCloudLinked: true,
      resolving: false,
    });
    expect(attachment).toEqual({
      status: "linked",
      projectId: "proj-err",
      warning: "Mapping failed",
    });
    expect(isProjectCloudLinked(attachment)).toBe(true);
    expect(attachmentHasBoundProject(attachment)).toBe(true);
    expect(getAttachedCloudProjectId(attachment)).toBe("proj-err");
  });

  it("resets Cloud Hub section when switching linked → unlinked", () => {
    expect(resolveCloudHubSectionForAttachment({ status: "linked", projectId: "a" })).toBe("contents");
    expect(resolveCloudHubSectionForAttachment({ status: "local-only", projectId: null })).toBe("overview");
    expect(resolveCloudHubSectionForAttachment({
      status: "error",
      projectId: null,
      message: "boom",
    })).toBe("overview");
  });

  it("keeps a known binding bound during a resolver error, while a browse selection remains transient", () => {
    const degradedBinding = {
      status: "linked" as const,
      projectId: "proj-known",
      warning: "Cloud is temporarily unavailable",
    };

    expect(resolveCloudProjectNavigationContext(degradedBinding, null)).toEqual({
      projectContext: true,
      projectBound: true,
    });
    expect(resolveCloudProjectNavigationContext(degradedBinding, "proj-preview")).toEqual({
      projectContext: true,
      projectBound: false,
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

    act(() => root?.render(
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
      "Automation",
      "Access",
      "Settings",
    ]);
    expect(rows.every((row) => !row.classList.contains("active"))).toBe(true);

    const lockedRows = rows;
    expect(lockedRows).toHaveLength(5);
    expect(lockedRows.every((row) => row.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(container.querySelector(".desktop-cloud-sidebar-nav-lock")).toBeNull();

    act(() => lockedRows[3]?.click());
    expect(onSelectSection).not.toHaveBeenCalled();
  });

  it("does not treat a stale project route as project context without binding/selection", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(
      <CloudServiceSidebar
        status={null}
        cloudSession={session}
        activeSection="history"
        projectContext={false}
        projectBound={false}
        onSelectSection={vi.fn()}
      />,
    ));

    expect(container.querySelector('[aria-label="Cloud sections"]')).not.toBeNull();
    expect(container.textContent).toContain("Cloud Projects");
    expect(container.textContent).not.toContain("History");
  });

  it("shows project hub nav only when projectContext is true", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(
      <CloudServiceSidebar
        status={null}
        cloudSession={session}
        activeSection="history"
        projectContext
        projectBound
        onSelectSection={vi.fn()}
      />,
    ));

    expect(container.querySelector('[aria-label="Cloud project sections"]')).not.toBeNull();
    expect(container.textContent).toContain("History");
    expect(container.textContent).toContain("Automation");
  });

  it("back to Cloud Projects clears browse context via onBackToProjects", () => {
    const onBackToProjects = vi.fn();
    const onSelectSection = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(
      <CloudServiceSidebar
        status={null}
        cloudSession={session}
        activeSection="contents"
        projectContext
        projectBound={false}
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

    act(() => root?.render(
      <CloudServiceSidebar
        status={null}
        cloudSession={session}
        activeSection="contents"
        projectContext
        projectBound={false}
        onSelectSection={vi.fn()}
      />,
    ));
    expect(container.querySelector('[aria-label="Cloud project sections"]')).not.toBeNull();

    act(() => root?.render(
      <CloudServiceSidebar
        status={null}
        cloudSession={session}
        activeSection="overview"
        projectContext={false}
        projectBound={false}
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
      root?.render(
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
});

describe("CloudRouter browse context", () => {
  it("routes History for an explicitly browsed project without promoting it to a local binding", async () => {
    getCloudHistory.mockReset();
    getCloudHistory.mockResolvedValue({ head_commit_id: null, commits: [] });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
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
          selectedProjectId="proj-preview"
          activeSection="history"
          accountEmail={session.user_email}
          accountConnected
          branchName="main"
          localChangeCount={0}
          loading={false}
          cloudBackupLoading={false}
          cloudAction={{ kind: null, projectId: null, message: null, error: null }}
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
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getCloudHistory).toHaveBeenCalledWith(
      session,
      "proj-preview",
      80,
      expect.any(Function),
      "https://cloud.example",
    );
    expect(container.textContent).toContain("History");
    expect(container.textContent).toContain("Preview Project");
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
      root?.render(
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

describe("Cloud Automation route dedupe", () => {
  it("reuses aggregate Cloud data and does not call useDesktopCloudAccessData", async () => {
    listCloudAutomationProviderSpecs.mockResolvedValue([]);
    const reload = vi.fn(async () => undefined);
    const cloudData = createAggregateCloudData(reload);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
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
    expect(container.querySelectorAll(".desktop-cloud-automation-page")).toHaveLength(1);
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
      root?.render(<CloudAccessDataProbe projectId="proj-a" />);
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(<CloudAccessDataProbe projectId={null} />);
      await Promise.resolve();
    });
    expect(container.firstElementChild?.getAttribute("data-scope-count")).toBe("0");
    expect(container.firstElementChild?.getAttribute("data-loading")).toBe("false");

    await act(async () => {
      delayedScopes.resolve([{ id: "scope-a", path: "/", is_root: true } as DesktopCloudScope]);
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
    expect(details.warning).toContain("Some Cloud project details could not be loaded");
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
    getCloudDashboard.mockReset();
    listCloudRoot.mockReset();
    getCloudHistory.mockReset();
    listCloudScopes.mockReset();
    listCloudConnectors.mockReset();
    listCloudMcpEndpoints.mockReset();
    getCloudRepoIdentity.mockReset();

    listCloudProjects.mockResolvedValue(projects);
    getCloudDashboard.mockImplementation(async (_session: unknown, projectId: string) => ({
      project: { id: projectId, name: projectId === "proj-a" ? "Project A" : "Project B" },
    }));
    listCloudRoot.mockResolvedValue({ entries: [] });
    getCloudHistory.mockResolvedValue({ head_commit_id: null, commits: [] });
    listCloudScopes.mockResolvedValue([]);
    listCloudConnectors.mockResolvedValue([]);
    listCloudMcpEndpoints.mockResolvedValue([]);
    getCloudRepoIdentity.mockResolvedValue(null);
  });

  it("clears the previous project's payload as soon as browse context changes", async () => {
    const secondProjectList = deferred<typeof projects>();
    listCloudProjects
      .mockResolvedValueOnce(projects)
      .mockImplementationOnce(() => secondProjectList.promise);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<CloudDataProbe selectedProjectId="proj-a" environment={cloudEnvironment} />);
      await flushPromises();
    });
    expect(container.firstElementChild?.getAttribute("data-loaded-project")).toBe("proj-a");

    await act(async () => {
      root?.render(<CloudDataProbe selectedProjectId="proj-b" environment={cloudEnvironment} />);
      await Promise.resolve();
    });

    expect(container.firstElementChild?.getAttribute("data-active-project")).toBe("proj-b");
    expect(container.firstElementChild?.getAttribute("data-loaded-project")).toBe("none");
    expect(container.firstElementChild?.getAttribute("data-loading")).toBe("true");

    await act(async () => {
      secondProjectList.resolve(projects);
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
      root?.render(
        <CloudDataProbe
          selectedProjectId="proj-a"
          environment={cloudEnvironment}
          onData={(data) => { latestData = data; }}
        />,
      );
      await flushPromises();
    });

    const reloadedProjects = deferred<typeof projects>();
    listCloudProjects.mockImplementationOnce(() => reloadedProjects.promise);
    let settled = false;
    let reloadPromise: Promise<void> | null = null;
    await act(async () => {
      reloadPromise = latestData?.reload() ?? null;
      reloadPromise?.then(() => { settled = true; });
      await Promise.resolve();
    });
    expect(settled).toBe(false);

    await act(async () => {
      reloadedProjects.resolve(projects);
      await reloadPromise;
    });
    expect(settled).toBe(true);
  });

  it("ignores an older project request that finishes after the new browse context", async () => {
    const firstProjectList = deferred<typeof projects>();
    listCloudProjects
      .mockImplementationOnce(() => firstProjectList.promise)
      .mockResolvedValueOnce(projects);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<CloudDataProbe selectedProjectId="proj-a" environment={cloudEnvironment} />);
      await Promise.resolve();
    });

    await act(async () => {
      root?.render(<CloudDataProbe selectedProjectId="proj-b" environment={cloudEnvironment} />);
      await flushPromises();
    });
    expect(container.firstElementChild?.getAttribute("data-active-project")).toBe("proj-b");

    await act(async () => {
      firstProjectList.resolve(projects);
      await flushPromises();
    });
    expect(container.firstElementChild?.getAttribute("data-active-project")).toBe("proj-b");
  });

  it("keeps project identity available while switching to a route-scoped loader", async () => {
    const routeRefresh = deferred<typeof projects>();
    listCloudProjects
      .mockResolvedValueOnce(projects)
      .mockImplementationOnce(() => routeRefresh.promise);
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <CloudDataProbe
          selectedProjectId="proj-a"
          environment={cloudEnvironment}
          loadProjectDetails
        />,
      );
      await flushPromises();
    });

    await act(async () => {
      root?.render(
        <CloudDataProbe
          selectedProjectId="proj-a"
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
      routeRefresh.resolve(projects);
      await flushPromises();
    });
  });

  it("keeps a local binding authoritative when the Cloud project list is unavailable", async () => {
    listCloudProjects.mockRejectedValueOnce(new Error("projects offline"));
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <CloudDataProbe
          selectedProjectId={null}
          boundProjectId="proj-bound"
          environment={cloudEnvironment}
        />,
      );
      await flushPromises();
    });

    expect(container.firstElementChild?.getAttribute("data-mapped-project")).toBe("proj-bound");
    expect(container.firstElementChild?.getAttribute("data-active-project")).toBe("proj-bound");
    expect(container.firstElementChild?.getAttribute("data-error")).toBe("projects offline");
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
      path: "/",
      is_root: true,
      name: "Root",
    } as never],
    connectors: [{
      id: "conn-1",
      scope_id: "scope-1",
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
  selectedProjectId,
  environment,
  onData,
  loadProjectDetails = true,
  boundProjectId = null,
}: {
  selectedProjectId: string | null;
  environment: CloudEnvironment;
  onData?: (data: DesktopCloudDataState) => void;
  loadProjectDetails?: boolean;
  boundProjectId?: string | null;
}) {
  const onSessionChange = React.useCallback(() => undefined, []);
  const data = useDesktopCloudData({
    session,
    cloudEnvironment: environment,
    selectedProjectId,
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
