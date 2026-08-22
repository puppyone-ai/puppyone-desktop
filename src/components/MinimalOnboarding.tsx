import { Button, resolveRendererPublicAssetUrl, type Workspace } from "@puppyone/shared-ui";
import { bidiIsolate, useLocalization, type MessageFormatter } from "@puppyone/localization";
import {
  AlertTriangle,
  FilePlus2,
  Folder,
  FolderOpen,
  GitFork,
  Plus,
  Unlink,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";
import {
  createTypographyRootProps,
  type ResolvedTypography,
} from "../features/typography";
import type {
  DarkThemePreset,
  DiffMarkers,
  LightThemePreset,
  TextSize,
  ThemeMode,
} from "../preferences";
import { useWorkspaceFolderDrop } from "../features/app-shell/useWorkspaceFolderDrop";
import { getWorkspaceParentPathForDisplay } from "../features/app-shell/workspaceHomeModel";
import { writeClipboardText } from "../features/settings/utils";
import type {
  WorkspaceCloneRepositoryRequest,
  WorkspaceCreateProjectRequest,
  WorkspaceProjectLocationGrant,
} from "../types/electron";
import { DesktopMenuIconButton, DesktopMenuItem } from "./DesktopMenu";
import { InlineLoading } from "./loading";
import { DesktopWindowDragRegion } from "./DesktopWindowChrome";
import { OnboardingProjectEntryDialog } from "./OnboardingProjectEntryDialog";

export type RecentWorkspaceHomeItem = {
  workspace: Workspace;
  lastOpenedAt?: string | null;
};

export type ProjectHomeItem = {
  id: string;
  label: string;
  localPath: string;
  lastOpenedAt?: string | null;
};

export type OnboardingOperationStatus = {
  title: string;
  detail?: string;
};

export type MinimalOnboardingProps = {
  onChooseWorkspace: () => Promise<void>;
  onChooseProjectLocation?: () => Promise<WorkspaceProjectLocationGrant | null>;
  onCreateProject?: (request: WorkspaceCreateProjectRequest) => Promise<boolean>;
  onCloneRepository?: (request: WorkspaceCloneRepositoryRequest) => Promise<boolean>;
  onOpenWorkspacePath: (path: string) => Promise<void>;
  onOpenDroppedWorkspace: (folder: File) => Promise<void>;
  onRemoveProject?: (path: string) => Promise<void>;
  recentWorkspaces?: RecentWorkspaceHomeItem[];
  projectItems?: ProjectHomeItem[];
  operationStatus?: OnboardingOperationStatus | null;
  initialError?: string | null;
  themeMode: ThemeMode;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
  textSize: TextSize;
  typography: ResolvedTypography;
  pointerCursors: boolean;
  diffMarkers: DiffMarkers;
  resolvedTheme: "light" | "dark";
  cornerSlot?: ReactNode;
};

/** Local repository entrypoint. Cloud is entered from an open repository only. */
export function MinimalOnboarding({
  onChooseWorkspace,
  onChooseProjectLocation,
  onCreateProject,
  onCloneRepository,
  onOpenWorkspacePath,
  onOpenDroppedWorkspace,
  onRemoveProject,
  recentWorkspaces = [],
  projectItems,
  initialError = null,
  themeMode,
  lightThemePreset,
  darkThemePreset,
  textSize,
  typography,
  pointerCursors,
  diffMarkers,
  resolvedTheme,
  cornerSlot,
}: MinimalOnboardingProps) {
  const { t, formatRelativeTime } = useLocalization();
  const [error, setError] = useState<string | null>(initialError);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [removingPath, setRemovingPath] = useState<string | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [entryDialog, setEntryDialog] = useState<"create" | "clone" | null>(null);
  const items = useMemo(
    () => (projectItems ?? recentWorkspaces.map(({ workspace, lastOpenedAt }) => ({
      id: workspace.id,
      label: workspace.name,
      localPath: workspace.path,
      lastOpenedAt: lastOpenedAt ?? null,
    }))).slice(0, 40),
    [projectItems, recentWorkspaces],
  );

  useEffect(() => setError(initialError), [initialError]);

  const openPath = async (path: string) => {
    if (openingPath) return;
    setError(null);
    setOpeningPath(path);
    try {
      await onOpenWorkspacePath(path);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setOpeningPath(null);
    }
  };

  const chooseFolder = async () => {
    if (openingPath) return;
    setError(null);
    setOpeningPath("__new__");
    try {
      await onChooseWorkspace();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setOpeningPath(null);
    }
  };

  const openDroppedFolder = async (folder: File) => {
    if (openingPath) return;
    setError(null);
    setOpeningPath("__drop__");
    try {
      await onOpenDroppedWorkspace(folder);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setOpeningPath(null);
    }
  };

  const removeProject = async (item: ProjectHomeItem) => {
    if (!onRemoveProject || openingPath || removingPath) return;
    const projectName = getProjectName(item, t("onboarding.projects.untitled"));
    const confirmed = window.confirm(
      t("settings.localProject.unlink.confirm", { workspace: bidiIsolate(projectName) }),
    );
    if (!confirmed) return;
    setError(null);
    setRemovingPath(item.localPath);
    try {
      await onRemoveProject(item.localPath);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setRemovingPath(null);
    }
  };

  const busy = Boolean(openingPath) || Boolean(removingPath);
  const startProjectDrag = (event: ReactDragEvent<HTMLButtonElement>, item: ProjectHomeItem) => {
    const absolutePath = item.localPath.trim();
    if (busy || !absolutePath) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", absolutePath);
    setDraggingPath(absolutePath);
    void writeClipboardText(absolutePath).catch(() => undefined);
  };
  const folderDrop = useWorkspaceFolderDrop({
    disabled: busy,
    onDropFolder: openDroppedFolder,
    onInvalidDrop: () => setError(t("onboarding.error.dropLocalFolder")),
  });

  const hasProjects = items.length > 0;

  return (
    <main
      className={`onboarding-shell onboarding-homepage-shell ${hasProjects ? "has-projects" : "is-empty"} ${resolvedTheme === "dark" ? "dark" : ""} ${folderDrop.dragging ? "dragging" : ""}`}
      data-po-scrollbar="content"
      data-theme-mode={themeMode}
      data-light-theme-preset={lightThemePreset}
      data-dark-theme-preset={darkThemePreset}
      data-text-size={textSize}
      data-interface-text-size={textSize}
      data-content-text-size={textSize}
      data-terminal-text-size={textSize}
      data-pointer-cursors={pointerCursors ? "true" : "false"}
      data-diff-markers={diffMarkers}
      {...createTypographyRootProps(typography)}
      onDragEnter={folderDrop.onDragEnter}
      onDragOver={folderDrop.onDragOver}
      onDragLeave={folderDrop.onDragLeave}
      onDrop={folderDrop.onDrop}
    >
      <DesktopWindowDragRegion className="onboarding-titlebar" />
      <section className={`onboarding-homepage ${hasProjects ? "has-projects" : "is-empty"}`} aria-label={t(hasProjects ? "onboarding.projects.localTitle" : "onboarding.projects.title")}>
        {!hasProjects && (
          <div className="onboarding-brand-lockup">
            <img
              className="onboarding-brand-mark"
              src={resolveRendererPublicAssetUrl("logo-square-v0.1.4-dark.png")}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
            <span className="onboarding-brand-name">{t("onboarding.brand.name")}</span>
          </div>
        )}

        {!hasProjects && (
          <div className="onboarding-primary-area">
            <div className="onboarding-entry-launcher" role="group" aria-label={t("onboarding.projects.title")}>
              <div className="onboarding-entry-actions">
                <Button
                  className={`onboarding-entry-action onboarding-entry-action-primary ${folderDrop.dragging ? "is-dragging" : ""}`}
                  tone="primary"
                  disabled={busy}
                  aria-busy={openingPath === "__new__" || undefined}
                  leadingIcon={openingPath === "__new__"
                    ? <InlineLoading label={null} size="sm" tone="neutral" />
                    : <FolderOpen aria-hidden="true" />}
                  onClick={() => void chooseFolder()}
                >
                  {t("onboarding.action.openFolder")}
                </Button>

                <Button
                  className="onboarding-entry-action onboarding-entry-action-secondary"
                  tone="neutral"
                  disabled={busy || !onCreateProject || !onChooseProjectLocation}
                  leadingIcon={<FilePlus2 className="onboarding-entry-create-icon" aria-hidden="true" />}
                  onClick={() => setEntryDialog("create")}
                >
                  {t("onboarding.action.createLocalProject")}
                </Button>

                <Button
                  className="onboarding-entry-action onboarding-entry-action-secondary onboarding-clone-action"
                  tone="neutral"
                  disabled={busy || !onCloneRepository}
                  leadingIcon={<GitFork aria-hidden="true" />}
                  onClick={() => setEntryDialog("clone")}
                >
                  {t("onboarding.action.cloneRepository")}
                </Button>
              </div>
            </div>
          </div>
        )}

        {hasProjects && (
          <div className="onboarding-projects-layout">
            <div className="onboarding-recent-projects">
              <div className="onboarding-recent-header">
                <div className="onboarding-recent-heading">{t("onboarding.projects.localTitle")}</div>
              </div>
              <div className="onboarding-project-list" data-po-scrollbar="menu">
                {items.map((item) => {
                  const name = getProjectName(item, t("onboarding.projects.untitled"));
                  const parentPath = getWorkspaceParentPathForDisplay(item.localPath);
                  const removing = removingPath === item.localPath;
                  const dragging = draggingPath === item.localPath;
                  return (
                    <div className={`onboarding-project-row-wrap ${removing ? "is-removing" : ""} ${dragging ? "is-dragging" : ""}`} key={item.id}>
                      <DesktopMenuItem
                        className="onboarding-project-row"
                        role="button"
                        icon={<Folder size={14} strokeWidth={1.85} />}
                        label={<bdi>{name}</bdi>}
                        detail={parentPath ? <bdi dir="ltr" title={item.localPath}>{parentPath}</bdi> : undefined}
                        trailing={openingPath === item.localPath
                          ? <InlineLoading label={t("onboarding.status.opening")} size="xs" tone="neutral" />
                          : formatRecentWorkspaceTime(item.lastOpenedAt, t, formatRelativeTime)}
                        disabled={busy}
                        aria-busy={openingPath === item.localPath || undefined}
                        aria-label={t("onboarding.projects.open", { project: bidiIsolate(name) })}
                        title={item.localPath}
                        draggable={!busy}
                        onClick={() => void openPath(item.localPath)}
                        onDragStart={(event) => startProjectDrag(event, item)}
                        onDragEnd={() => setDraggingPath(null)}
                      />
                      {onRemoveProject && (
                        <DesktopMenuIconButton
                          className="onboarding-project-remove"
                          disabled={busy && !removing}
                          aria-busy={removing || undefined}
                          label={t("onboarding.projects.removeFor", { project: bidiIsolate(name) })}
                          title={t("onboarding.projects.removeHint")}
                          onClick={() => void removeProject(item)}
                          icon={removing
                            ? <InlineLoading label={null} size="xs" tone="neutral" />
                            : <Unlink size={14} aria-hidden="true" />}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="onboarding-project-add">
                <DesktopMenuItem
                  className="onboarding-project-add-action"
                  role="button"
                  icon={openingPath === "__new__"
                    ? <InlineLoading label={null} size="xs" tone="neutral" />
                    : <ProjectFolderAddIcon />}
                  label={t("onboarding.action.openLocalFolder")}
                  disabled={busy}
                  aria-busy={openingPath === "__new__" || undefined}
                  onClick={() => void chooseFolder()}
                />
              </div>
            </div>
          </div>
        )}

        {error && <div className="onboarding-error onboarding-homepage-error" role="alert"><AlertTriangle size={15} /><span>{error}</span></div>}
      </section>
      {entryDialog === "create" && onCreateProject && onChooseProjectLocation && (
        <OnboardingProjectEntryDialog
          kind="create"
          onClose={() => setEntryDialog(null)}
          onChooseLocation={onChooseProjectLocation}
          onSubmit={(value, locationGrantId) => onCreateProject({
            name: value,
            locationGrantId: locationGrantId ?? "",
          })}
        />
      )}
      {entryDialog === "clone" && onCloneRepository && (
        <OnboardingProjectEntryDialog
          kind="clone"
          onClose={() => setEntryDialog(null)}
          onSubmit={(value) => onCloneRepository({ repositoryUrl: value })}
        />
      )}
      {cornerSlot}
    </main>
  );
}

function ProjectFolderAddIcon() {
  return (
    <span className="onboarding-project-folder-add-icon" aria-hidden="true">
      <Folder size={14} strokeWidth={1.85} />
      <Plus size={6} strokeWidth={4} />
    </span>
  );
}

function getProjectName(item: ProjectHomeItem, fallback: string) {
  const label = item.label.trim();
  if (label && label !== item.localPath) return label;

  const normalizedPath = item.localPath.length > 1
    ? item.localPath.replace(/\/+$/, "")
    : item.localPath;
  return normalizedPath.split("/").at(-1) || label || fallback;
}

function formatRecentWorkspaceTime(
  value: string | null | undefined,
  t: MessageFormatter,
  formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions) => string,
) {
  if (!value) return t("onboarding.time.previouslyOpened");
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return t("onboarding.time.previouslyOpened");
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < minute) return t("onboarding.time.justNow");
  if (elapsed < hour) return formatRelativeTime(-Math.max(1, Math.floor(elapsed / minute)), "minute", { numeric: "always" });
  if (elapsed < day) return formatRelativeTime(-Math.max(1, Math.floor(elapsed / hour)), "hour", { numeric: "always" });
  return formatRelativeTime(-Math.max(1, Math.floor(elapsed / day)), "day", { numeric: "always" });
}
