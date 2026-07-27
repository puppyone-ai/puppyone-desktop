import type { Workspace } from "@puppyone/shared-ui";
import { bidiIsolate, useLocalization, type MessageFormatter } from "@puppyone/localization";
import { AlertTriangle, Folder, FolderOpen } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
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
import { InlineLoading } from "./loading";
import { DesktopWindowDragRegion } from "./DesktopWindowChrome";

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
  onOpenWorkspacePath: (path: string) => Promise<void>;
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
  onOpenWorkspacePath,
  recentWorkspaces = [],
  projectItems,
  operationStatus = null,
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
  const [dragging, setDragging] = useState(false);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const items = useMemo(
    () => (projectItems ?? recentWorkspaces.map(({ workspace, lastOpenedAt }) => ({
      id: workspace.id,
      label: workspace.path,
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

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files.item(0);
    const path = file
      ? window.puppyoneDesktop?.getPathForFile(file) || (file as File & { path?: string }).path
      : null;
    if (!path?.trim().startsWith("/")) {
      setError(t("onboarding.error.dropLocalFolder"));
      return;
    }
    await openPath(path.trim());
  };

  const localOperation = openingPath
    ? {
        title: t(openingPath === "__new__"
          ? "onboarding.operation.choosingFolder.title"
          : "onboarding.operation.openingLocal.title"),
        detail: t(openingPath === "__new__"
          ? "onboarding.operation.choosingFolder.detail"
          : "onboarding.operation.openingLocal.detail"),
      }
    : null;
  const activeOperation = operationStatus ?? localOperation;

  return (
    <main
      className={`onboarding-shell onboarding-homepage-shell ${resolvedTheme === "dark" ? "dark" : ""} ${dragging ? "dragging" : ""}`}
      data-theme-mode={themeMode}
      data-light-theme-preset={lightThemePreset}
      data-dark-theme-preset={darkThemePreset}
      data-text-size={textSize}
      data-pointer-cursors={pointerCursors ? "true" : "false"}
      data-diff-markers={diffMarkers}
      {...createTypographyRootProps(typography)}
      onDragEnter={() => setDragging(true)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setDragging(false);
      }}
      onDrop={(event) => void handleDrop(event)}
    >
      <DesktopWindowDragRegion className="onboarding-titlebar" />
      <section className="onboarding-homepage" aria-label={t("onboarding.projects.title")}>
        <div className="onboarding-primary-area">
          <div className="onboarding-folder-action-wrap">
            <div className={`folder-drop-zone ${dragging ? "dragging" : ""} ${openingPath ? "is-disabled" : ""}`}>
              <svg className="folder-drop-outline" viewBox="0 0 260 260" preserveAspectRatio="none" aria-hidden="true">
                <path className="folder-drop-shadow" d="M9 2H62C68 2 72 6 72 12V38H251C255 38 258 41 258 45V251C258 255 255 258 251 258H9C5 258 2 255 2 251V9C2 5 5 2 9 2Z" />
                <path className="folder-drop-fill" d="M9 2H62C68 2 72 6 72 12V38H251C255 38 258 41 258 45V251C258 255 255 258 251 258H9C5 258 2 255 2 251V9C2 5 5 2 9 2Z" />
                <path className="folder-drop-border" d="M9 2H62C68 2 72 6 72 12V38H251C255 38 258 41 258 45V251C258 255 255 258 251 258H9C5 258 2 255 2 251V9C2 5 5 2 9 2Z" />
              </svg>
              <button
                className="folder-drop-primary-action"
                type="button"
                disabled={Boolean(openingPath)}
                aria-busy={openingPath === "__new__" || undefined}
                aria-label={t("onboarding.action.openLocalFolder")}
                onClick={() => void chooseFolder()}
              />
              <span className="folder-drop-body">
                {openingPath === "__new__" ? (
                  <InlineLoading label={null} size="sm" tone="neutral" className="folder-drop-loading" />
                ) : (
                  <FolderOpen size={25} strokeWidth={1.75} className="folder-drop-icon" aria-hidden="true" />
                )}
                <span className="folder-drop-copy"><strong>{t("onboarding.action.openLocalFolder")}</strong></span>
              </span>
            </div>
          </div>
          {activeOperation && (
            <div className="onboarding-operation-status" role="status" aria-live="polite">
              <InlineLoading label={activeOperation.title} size="xs" tone="neutral" />
              {activeOperation.detail && <span>{activeOperation.detail}</span>}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="onboarding-recent-projects">
            <div className="onboarding-recent-heading">{t("onboarding.projects.title")}</div>
            <div className="onboarding-project-list">
              {items.map((item) => (
                <button
                  key={item.id}
                  className="onboarding-project-row"
                  type="button"
                  disabled={Boolean(openingPath) || Boolean(operationStatus)}
                  aria-busy={openingPath === item.localPath || undefined}
                  aria-label={t("onboarding.projects.open", { project: bidiIsolate(item.label) })}
                  title={item.localPath}
                  onClick={() => void openPath(item.localPath)}
                >
                  <span className="onboarding-project-row-icon" aria-hidden="true"><Folder size={14} strokeWidth={1.85} /></span>
                  <span className="onboarding-project-row-main"><bdi className="onboarding-project-row-title">{formatWorkspaceLocator(item.label)}</bdi></span>
                  <span className="onboarding-project-row-meta">
                    <span className="onboarding-project-row-time">
                      {openingPath === item.localPath
                        ? <InlineLoading label={t("onboarding.status.opening")} size="xs" tone="neutral" />
                        : formatRecentWorkspaceTime(item.lastOpenedAt, t, formatRelativeTime)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <div className="onboarding-error onboarding-homepage-error" role="alert"><AlertTriangle size={15} /><span>{error}</span></div>}
      </section>
      {cornerSlot}
    </main>
  );
}

function formatWorkspaceLocator(path: string) {
  if (!path.startsWith("/Users/")) return path;
  const [, , ...rest] = path.split("/");
  return rest.length > 0 ? `~/${rest.join("/")}` : "~";
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
