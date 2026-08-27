import { bidiIsolate, useLocalization } from "@puppyone/localization";
import { AlertTriangle } from "lucide-react";
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
import {
  getProjectName,
  type ProjectHomeItem,
  type RecentWorkspaceHomeItem,
} from "../features/app-shell/workspaceHomeModel";
import { writeClipboardText } from "../features/settings/utils";
import type {
  WorkspaceCloneRepositoryRequest,
  WorkspaceCreateProjectRequest,
  WorkspaceProjectLocationGrant,
} from "../types/electron";
import { DesktopWindowDragRegion } from "./DesktopWindowChrome";
import { OnboardingProjectEntryDialog } from "./OnboardingProjectEntryDialog";
import { OnboardingBrandLockup } from "./onboarding/OnboardingBrandLockup";
import { OnboardingEntryActions } from "./onboarding/OnboardingEntryActions";
import { OnboardingProjectList } from "./onboarding/OnboardingProjectList";
import type { OnboardingHomeState } from "./onboarding/types";

export type { ProjectHomeItem, RecentWorkspaceHomeItem } from "../features/app-shell/workspaceHomeModel";

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
  const { t } = useLocalization();
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
  const onboardingState: OnboardingHomeState = hasProjects ? "projects" : "empty";

  return (
    <main
      className={`onboarding-shell onboarding-homepage-shell ${resolvedTheme === "dark" ? "dark" : ""} ${folderDrop.dragging ? "dragging" : ""}`}
      data-onboarding-state={onboardingState}
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
      <section
        className="onboarding-homepage"
        aria-label={t("onboarding.projects.title")}
      >
        <OnboardingBrandLockup state={onboardingState} resolvedTheme={resolvedTheme} />

        {hasProjects && (
          <OnboardingProjectList
            items={items}
            busy={busy}
            openingPath={openingPath}
            removingPath={removingPath}
            draggingPath={draggingPath}
            onOpen={(path) => void openPath(path)}
            onRemove={onRemoveProject ? (item) => void removeProject(item) : undefined}
            onDragStart={startProjectDrag}
            onDragEnd={() => setDraggingPath(null)}
          />
        )}

        <OnboardingEntryActions
          state={onboardingState}
          busy={busy}
          openingFolder={openingPath === "__new__"}
          draggingFolder={folderDrop.dragging}
          canCreateProject={Boolean(onCreateProject && onChooseProjectLocation)}
          canCloneRepository={Boolean(onCloneRepository)}
          onOpenFolder={() => void chooseFolder()}
          onCreateProject={() => setEntryDialog("create")}
          onCloneRepository={() => setEntryDialog("clone")}
        />

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
