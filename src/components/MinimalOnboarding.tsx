import type { Workspace } from "@puppyone/shared-ui";
import { AlertTriangle, Cloud, Folder, FolderOpen, Monitor } from "lucide-react";
import type { DragEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { DarkThemePreset, LightThemePreset, ThemeMode } from "../preferences";
import { InlineLoading } from "./loading";

export type RecentWorkspaceHomeItem = {
  workspace: Workspace;
  lastOpenedAt?: string | null;
};

export type CloudProjectHomeItem = {
  id: string;
  name: string;
  description?: string | null;
  updated_at?: string | null;
};

export type ProjectHomeItem = {
  id: string;
  kind: "local" | "cloud" | "cloud-local" | "cloud-linked";
  label: string;
  detail?: string | null;
  localPath?: string | null;
  cloudProjectId?: string | null;
  description?: string | null;
  lastOpenedAt?: string | null;
  updatedAt?: string | null;
};

export type OnboardingOperationStatus = {
  title: string;
  detail?: string;
};

type MinimalOnboardingProps = {
  onChooseWorkspace: () => Promise<void>;
  onCreateCloudProject?: () => Promise<void>;
  onOpenCloudProject?: (projectId: string) => Promise<void> | void;
  onOpenWorkspacePath: (path: string) => Promise<void>;
  recentWorkspaces?: RecentWorkspaceHomeItem[];
  cloudProjects?: CloudProjectHomeItem[];
  projectItems?: ProjectHomeItem[];
  cloudSignedIn?: boolean;
  cloudProjectsLoading?: boolean;
  cloudProjectsError?: string | null;
  operationStatus?: OnboardingOperationStatus | null;
  initialError?: string | null;
  themeMode: ThemeMode;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
  resolvedTheme: "light" | "dark";
};

export function MinimalOnboarding({
  onChooseWorkspace,
  onCreateCloudProject,
  onOpenCloudProject,
  onOpenWorkspacePath,
  recentWorkspaces = [],
  cloudProjects = [],
  projectItems,
  cloudSignedIn = false,
  cloudProjectsLoading = false,
  cloudProjectsError = null,
  operationStatus = null,
  initialError = null,
  themeMode,
  lightThemePreset,
  darkThemePreset,
  resolvedTheme,
}: MinimalOnboardingProps) {
  const [error, setError] = useState<string | null>(initialError);
  const [dragging, setDragging] = useState(false);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [cloudMode, setCloudMode] = useState(false);
  const cloudProjectAvailable = Boolean(onCreateCloudProject);
  const visibleProjectItems = useMemo(
    () => (projectItems ?? createLegacyProjectItems(recentWorkspaces, cloudProjects)).slice(0, 40),
    [cloudProjects, projectItems, recentWorkspaces],
  );
  const showCloudProjectsState = cloudSignedIn && (cloudProjectsLoading || Boolean(cloudProjectsError) || visibleProjectItems.some(isCloudProjectItem));
  const showProjectsList = visibleProjectItems.length > 0 || showCloudProjectsState;
  const localOperationStatus = getLocalOperationStatus(openingPath);
  const activeOperationStatus = operationStatus ?? localOperationStatus;
  const folderOperationStatus = operationStatus ?? (
    openingPath === "__cloud__" || openingPath === "__new__"
      ? localOperationStatus
      : null
  );

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  useEffect(() => {
    if (!cloudProjectAvailable && cloudMode) setCloudMode(false);
  }, [cloudMode, cloudProjectAvailable]);

  const openDroppedFolder = async (path: string) => {
    setError(null);
    const nextPath = path.trim();
    if (!nextPath.startsWith("/")) {
      setError("Drop a local folder or click to choose one.");
      return;
    }

    setOpeningPath(nextPath);
    try {
      await onOpenWorkspacePath(nextPath);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpeningPath(null);
    }
  };

  const chooseFolder = async () => {
    setError(null);
    setOpeningPath("__new__");
    try {
      await onChooseWorkspace();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpeningPath(null);
    }
  };

  const createCloudProject = async () => {
    setError(null);
    setOpeningPath("__cloud__");
    try {
      if (!onCreateCloudProject) {
        throw new Error("Cloud project creation is not available.");
      }
      await onCreateCloudProject();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpeningPath(null);
    }
  };

  const openRecentWorkspace = async (path: string) => {
    if (openingPath) return;
    setError(null);
    setOpeningPath(path);
    try {
      await onOpenWorkspacePath(path);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpeningPath(null);
    }
  };

  const openCloudProject = async (projectId: string) => {
    if (openingPath) return;
    setError(null);
    setOpeningPath(`cloud:${projectId}`);
    try {
      if (!onOpenCloudProject) {
        throw new Error("Cloud project opening is not available.");
      }
      await onOpenCloudProject(projectId);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setOpeningPath(null);
    }
  };

  const openProjectItem = async (item: ProjectHomeItem) => {
    if (openingPath) return;
    if (item.localPath) {
      await openRecentWorkspace(item.localPath);
      return;
    }
    if (item.cloudProjectId) {
      await openCloudProject(item.cloudProjectId);
      return;
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDragging(false);
  };

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files.item(0);
    const droppedPath = file
      ? window.puppyoneDesktop?.getPathForFile(file) || (file as File & { path?: string }).path
      : null;

    if (!droppedPath) {
      setError("Could not read that folder path. Click the folder box to choose it instead.");
      return;
    }

    await openDroppedFolder(droppedPath);
  };

  return (
    <main
      className={`onboarding-shell onboarding-homepage-shell ${resolvedTheme === "dark" ? "dark" : ""} ${dragging ? "dragging" : ""}`}
      data-theme-mode={themeMode}
      data-light-theme-preset={lightThemePreset}
      data-dark-theme-preset={darkThemePreset}
      onDragEnter={() => setDragging(true)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="onboarding-titlebar" aria-hidden="true" />
      <section className="onboarding-homepage" aria-label="Projects">
        <div className="onboarding-primary-area">
          <div className="onboarding-folder-action-wrap">
            <div
              className={`folder-drop-zone ${dragging && !cloudMode ? "dragging" : ""} ${cloudMode ? "cloud-mode" : ""} ${
                openingPath !== null ? "is-disabled" : ""
              }`}
            >
              <svg
                className="folder-drop-outline"
                viewBox="0 0 260 260"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  className="folder-drop-shadow"
                  d="M9 2H62C68 2 72 6 72 12V38H251C255 38 258 41 258 45V251C258 255 255 258 251 258H9C5 258 2 255 2 251V9C2 5 5 2 9 2Z"
                />
                <path
                  className="folder-drop-fill"
                  d="M9 2H62C68 2 72 6 72 12V38H251C255 38 258 41 258 45V251C258 255 255 258 251 258H9C5 258 2 255 2 251V9C2 5 5 2 9 2Z"
                />
                <path
                  className="folder-drop-border"
                  d="M9 2H62C68 2 72 6 72 12V38H251C255 38 258 41 258 45V251C258 255 255 258 251 258H9C5 258 2 255 2 251V9C2 5 5 2 9 2Z"
                />
              </svg>
              <button
                className="folder-drop-primary-action"
                type="button"
                disabled={openingPath !== null}
                aria-busy={openingPath === (cloudMode ? "__cloud__" : "__new__") || undefined}
                aria-label={cloudMode ? "Create cloud project" : "Open local folder"}
                onClick={() => void (cloudMode ? createCloudProject() : chooseFolder())}
              />
              <span className="folder-drop-body">
                {folderOperationStatus ? (
                  <InlineLoading
                    label={null}
                    size="sm"
                    tone="neutral"
                    className="folder-drop-loading"
                  />
                ) : cloudMode ? (
                  <Cloud size={25} strokeWidth={1.75} className="folder-drop-icon" aria-hidden="true" />
                ) : (
                  <FolderOpen size={25} strokeWidth={1.75} className="folder-drop-icon" aria-hidden="true" />
                )}
                <span className="folder-drop-copy">
                  <strong>{folderOperationStatus?.title ?? (cloudMode ? "Create cloud project" : "Open local folder")}</strong>
                </span>
              </span>
            </div>
            {cloudProjectAvailable && (
              <button
                className="onboarding-mode-switch"
                type="button"
                disabled={openingPath !== null}
                aria-label={cloudMode ? "Switch to local project" : "Switch to cloud project"}
                aria-pressed={cloudMode}
                title={cloudMode ? "Switch to local project" : "Switch to cloud project"}
                onClick={() => setCloudMode((value) => !value)}
              >
                <span>switch to</span>
                <strong>{cloudMode ? "Local" : "Cloud"}</strong>
                {cloudMode ? (
                  <Monitor size={15} strokeWidth={1.85} aria-hidden="true" />
                ) : (
                  <Cloud size={15} strokeWidth={1.85} aria-hidden="true" />
                )}
              </button>
            )}
          </div>
          {activeOperationStatus && (
            <div className="onboarding-operation-status" role="status" aria-live="polite">
              <InlineLoading label={activeOperationStatus.title} size="xs" tone="neutral" />
              {activeOperationStatus.detail && <span>{activeOperationStatus.detail}</span>}
            </div>
          )}
        </div>

        {showProjectsList && (
          <div className="onboarding-recent-projects">
            <div className="onboarding-recent-heading">Projects</div>
            <div className="onboarding-project-list">
              {visibleProjectItems.map((item) => {
                const itemOpening = openingPath === getProjectOpeningKey(item);
                return (
                  <button
                    key={item.id}
                    className="onboarding-project-row"
                    type="button"
                    disabled={openingPath !== null || Boolean(operationStatus)}
                    aria-busy={itemOpening || undefined}
                    aria-label={`Open ${item.label}`}
                    title={getProjectItemTitle(item)}
                    onClick={() => void openProjectItem(item)}
                  >
                    <ProjectRowIcon kind={item.kind} />
                    <span className="onboarding-project-row-main">
                      <span className="onboarding-project-row-title">{formatProjectItemLabel(item)}</span>
                    </span>
                    <span className="onboarding-project-row-meta">
                      <span className="onboarding-project-row-time">
                        {itemOpening ? (
                          <InlineLoading label="Opening" size="xs" tone="neutral" />
                        ) : (
                          formatRecentWorkspaceTime(item.lastOpenedAt ?? item.updatedAt)
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
              {cloudSignedIn && cloudProjectsLoading && visibleProjectItems.length === 0 && (
                <div className="onboarding-project-row onboarding-project-row-static">
                  <span className="onboarding-project-row-icon" aria-hidden="true">
                    <Cloud size={14} strokeWidth={1.85} />
                  </span>
                  <span className="onboarding-project-row-path">
                    <span>Loading cloud projects</span>
                  </span>
                  <span className="onboarding-project-row-time"> </span>
                </div>
              )}
              {cloudSignedIn && !cloudProjectsLoading && cloudProjectsError && visibleProjectItems.length === 0 && (
                <div className="onboarding-project-row onboarding-project-row-static">
                  <span className="onboarding-project-row-icon" aria-hidden="true">
                    <Cloud size={14} strokeWidth={1.85} />
                  </span>
                  <span className="onboarding-project-row-path">
                    <span>Cloud projects unavailable</span>
                  </span>
                  <span className="onboarding-project-row-time"> </span>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="onboarding-error onboarding-homepage-error" role="alert">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        )}
        {cloudSignedIn && cloudProjectsError && !error && (
          <div className="onboarding-error onboarding-homepage-error" role="alert">
            <AlertTriangle size={15} />
            <span>{cloudProjectsError}</span>
          </div>
        )}
      </section>
    </main>
  );
}

function createLegacyProjectItems(
  recentWorkspaces: RecentWorkspaceHomeItem[],
  cloudProjects: CloudProjectHomeItem[],
): ProjectHomeItem[] {
  return [
    ...recentWorkspaces.slice(0, 20).map((item) => ({
      id: item.workspace.id,
      kind: "local" as const,
      label: item.workspace.path,
      localPath: item.workspace.path,
      lastOpenedAt: item.lastOpenedAt ?? null,
    })),
    ...cloudProjects.slice(0, 20).map((project) => ({
      id: `cloud:${project.id}`,
      kind: "cloud" as const,
      label: project.name,
      cloudProjectId: project.id,
      description: project.description ?? null,
      updatedAt: project.updated_at ?? null,
    })),
  ];
}

function ProjectRowIcon({ kind }: { kind: ProjectHomeItem["kind"] }) {
  if (kind === "cloud-local" || kind === "cloud-linked") {
    return (
      <span className="onboarding-project-row-icon linked" aria-hidden="true">
        <Folder size={14} strokeWidth={1.85} className="onboarding-project-row-folder-mark" />
        <span className="onboarding-project-row-cloud-badge">
          <Cloud size={12} strokeWidth={2} />
        </span>
      </span>
    );
  }

  return (
    <span className="onboarding-project-row-icon" aria-hidden="true">
      {kind === "cloud" ? <Cloud size={14} strokeWidth={1.85} /> : <Folder size={14} strokeWidth={1.85} />}
    </span>
  );
}

function isCloudProjectItem(item: ProjectHomeItem) {
  return item.kind === "cloud" || item.kind === "cloud-local" || item.kind === "cloud-linked";
}

function formatProjectItemLabel(item: ProjectHomeItem) {
  if (item.localPath) return formatWorkspaceLocator(item.localPath);
  return formatWorkspaceLocator(item.label || "Untitled Project");
}

function getProjectOpeningKey(item: ProjectHomeItem) {
  return item.localPath ?? (item.cloudProjectId ? `cloud:${item.cloudProjectId}` : item.id);
}

function getLocalOperationStatus(openingPath: string | null): OnboardingOperationStatus | null {
  if (!openingPath) return null;
  if (openingPath === "__cloud__") {
    return {
      title: "Creating cloud project",
      detail: "Preparing a new Puppyone Cloud workspace.",
    };
  }
  if (openingPath === "__new__") {
    return {
      title: "Opening local folder",
      detail: "Waiting for folder selection.",
    };
  }
  if (openingPath.startsWith("cloud:")) {
    return {
      title: "Opening cloud project",
      detail: "Loading the project workspace.",
    };
  }
  return {
    title: "Opening local folder",
    detail: "Loading the selected workspace.",
  };
}

function getProjectItemTitle(item: ProjectHomeItem) {
  const label = formatProjectItemLabel(item);
  const detail = item.detail && item.detail !== item.label ? item.detail : item.description;
  return detail ? `${label} - ${detail}` : label;
}

function formatWorkspaceLocator(workspacePath: string) {
  const homePrefix = "/Users/";
  if (!workspacePath.startsWith(homePrefix)) return workspacePath;

  const [, , ...rest] = workspacePath.split("/");
  if (rest.length === 0) return "~";
  return `~/${rest.join("/")}`;
}

function formatRecentWorkspaceTime(value?: string | null) {
  if (!value) return "Previously opened";
  const openedAt = new Date(value).getTime();
  if (Number.isNaN(openedAt)) return "Previously opened";

  const elapsedMs = Math.max(0, Date.now() - openedAt);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (elapsedMs < minute) return "Just now";

  const formatUnit = (unitMs: number, label: string) => {
    const count = Math.max(1, Math.floor(elapsedMs / unitMs));
    return `${count} ${label}${count === 1 ? "" : "s"} ago`;
  };

  if (elapsedMs < hour) return formatUnit(minute, "minute");
  if (elapsedMs < day) return formatUnit(hour, "hour");
  if (elapsedMs < week) return formatUnit(day, "day");
  if (elapsedMs < month) return formatUnit(week, "week");
  return formatUnit(month, "month");
}
