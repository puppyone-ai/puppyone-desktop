import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  FolderOpen,
  Link2,
  Monitor,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { DragEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  CloudProjectHomeItem,
  MinimalOnboardingProps,
  OnboardingOperationStatus,
  ProjectHomeItem,
  RecentWorkspaceHomeItem,
} from "./MinimalOnboarding";
import { InlineLoading } from "./loading";
import { createTypographyRootProps } from "../features/typography";
import { bidiIsolate, useLocalization, type MessageFormatter } from "@puppyone/localization";

type AssetFilter = "all" | "cloud" | "local";
type AssetLocationTone = "cloud" | "linked" | "local" | "synced";

export function AssetLibraryHome({
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
  textSize,
  typography,
  pointerCursors,
  diffMarkers,
  resolvedTheme,
}: MinimalOnboardingProps) {
  const { t } = useLocalization();
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [error, setError] = useState<string | null>(initialError);
  const [dragging, setDragging] = useState(false);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  const assets = useMemo(() => {
    const items = projectItems ?? createLegacyAssetItems(recentWorkspaces, cloudProjects);
    return [...items].slice(0, 40).sort(compareAssetActivity);
  }, [cloudProjects, projectItems, recentWorkspaces]);

  const visibleAssets = useMemo(() => assets.filter((item) => {
    if (filter === "cloud" && !assetHasCloudLocation(item)) return false;
    if (filter === "local" && !assetHasLocalLocation(item)) return false;
    return true;
  }), [assets, filter]);

  const localOperationStatus = getAssetLibraryOperationStatus(openingKey, t);
  const activeOperationStatus = operationStatus ?? localOperationStatus;
  const busy = openingKey !== null || Boolean(operationStatus);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  const chooseFolder = async () => {
    if (busy) return;
    setCreateMenuOpen(false);
    setError(null);
    setOpeningKey("__new__");
    try {
      await onChooseWorkspace();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setOpeningKey(null);
    }
  };

  const createCloudProject = async () => {
    if (busy || !onCreateCloudProject) return;
    setCreateMenuOpen(false);
    setError(null);
    setOpeningKey("__cloud__");
    try {
      await onCreateCloudProject();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setOpeningKey(null);
    }
  };

  const openAsset = async (item: ProjectHomeItem) => {
    if (busy) return;
    const key = getAssetOpeningKey(item);
    setError(null);
    setOpeningKey(key);
    try {
      if (item.localPath) {
        await onOpenWorkspacePath(item.localPath);
      } else if (item.cloudProjectId && onOpenCloudProject) {
        await onOpenCloudProject(item.cloudProjectId);
      } else {
        throw new Error(t("onboarding.library.error.unavailable"));
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setOpeningKey(null);
    }
  };

  const openDroppedFolder = async (path: string) => {
    if (busy) return;
    const nextPath = path.trim();
    if (!nextPath.startsWith("/")) {
      setError(t("onboarding.library.error.dropLocalFolder"));
      return;
    }

    setError(null);
    setOpeningKey(nextPath);
    try {
      await onOpenWorkspacePath(nextPath);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setOpeningKey(null);
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
      setError(t("onboarding.library.error.unreadableDrop"));
      return;
    }
    await openDroppedFolder(droppedPath);
  };

  return (
    <main
      className={`onboarding-shell asset-library-home-shell ${resolvedTheme === "dark" ? "dark" : ""} ${dragging ? "is-dragging" : ""}`}
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
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="asset-library-home-titlebar" aria-hidden="true" />
      <section className="asset-library-home" aria-label={t("onboarding.projects.title")}>
        <header className="asset-library-home-header">
          <div className="asset-library-home-heading">
            <h1>{t("onboarding.projects.title")}</h1>
          </div>
        </header>

        <div className="asset-library-home-filter-row" role="group" aria-label={t("onboarding.library.filterAriaLabel")}>
          <AssetFilterButton current={filter} value="all" label={t("onboarding.library.filter.all")} onSelect={setFilter} />
          <AssetFilterButton current={filter} value="cloud" label={t("onboarding.location.cloud")} icon="cloud" onSelect={setFilter} />
          <AssetFilterButton current={filter} value="local" label={t("onboarding.library.filter.local")} icon="local" onSelect={setFilter} />
        </div>

        {activeOperationStatus && (
          <div className="asset-library-home-operation" role="status" aria-live="polite">
            <InlineLoading label={activeOperationStatus.title} size="xs" tone="neutral" />
            {activeOperationStatus.detail && <span>{activeOperationStatus.detail}</span>}
          </div>
        )}

        {(error || (cloudSignedIn && cloudProjectsError)) && (
          <div className="asset-library-home-alert" role="alert">
            <AlertTriangle size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>{error ?? cloudProjectsError}</span>
          </div>
        )}

        <div className="asset-library-home-grid">
          {visibleAssets.map((item) => (
            <AssetLibraryCard
              key={item.id}
              item={item}
              busy={busy}
              opening={openingKey === getAssetOpeningKey(item)}
              onOpen={() => void openAsset(item)}
            />
          ))}
          {filter === "all" && (
            <NewProjectCard
              busy={busy}
              cloudAvailable={Boolean(onCreateCloudProject)}
              menuOpen={createMenuOpen}
              onMenuOpenChange={setCreateMenuOpen}
              onCreateCloud={() => void createCloudProject()}
              onChooseFolder={() => void chooseFolder()}
            />
          )}
        </div>

        {visibleAssets.length === 0 && filter !== "all" && (
          <div className="asset-library-home-empty">
            <strong>{t("onboarding.library.empty.title")}</strong>
            <span>{t("onboarding.library.empty.detail")}</span>
          </div>
        )}

        {cloudSignedIn && cloudProjectsLoading && (
          <div className="asset-library-home-cloud-status" role="status">
            <RefreshCw size={13} strokeWidth={1.8} aria-hidden="true" />
            <span>{t("onboarding.library.refreshingCloud")}</span>
          </div>
        )}
      </section>

      {dragging && (
        <div className="asset-library-home-drop-overlay" aria-hidden="true">
          <FolderOpen size={24} strokeWidth={1.6} />
          <strong>{t("onboarding.library.dropOverlay")}</strong>
        </div>
      )}
    </main>
  );
}

function AssetFilterButton({
  current,
  value,
  label,
  icon,
  onSelect,
}: {
  current: AssetFilter;
  value: AssetFilter;
  label: string;
  icon?: "cloud" | "local";
  onSelect: (value: AssetFilter) => void;
}) {
  return (
    <button
      className={current === value ? "is-active" : ""}
      type="button"
      aria-pressed={current === value}
      onClick={() => onSelect(value)}
    >
      {icon === "cloud" && <Cloud size={14} strokeWidth={1.8} aria-hidden="true" />}
      {icon === "local" && <Monitor size={14} strokeWidth={1.8} aria-hidden="true" />}
      <span>{label}</span>
    </button>
  );
}

function AssetLibraryCard({
  item,
  busy,
  opening,
  onOpen,
}: {
  item: ProjectHomeItem;
  busy: boolean;
  opening: boolean;
  onOpen: () => void;
}) {
  const { t, formatDate, formatRelativeTime } = useLocalization();
  const name = getAssetName(item, t("onboarding.projects.untitled"));
  const location = getAssetLocation(item, t);
  const tooltip = item.localPath ?? item.description ?? item.label;
  const signature = getAssetSignature(item);

  return (
    <article className={`asset-library-card ${opening ? "is-opening" : ""}`}>
      <button
        className="asset-library-card-main"
        type="button"
        title={tooltip}
        disabled={busy}
        aria-busy={opening || undefined}
        aria-label={t("onboarding.projects.open", { project: bidiIsolate(name) })}
        onClick={onOpen}
      >
        <span className="asset-library-card-cover" data-signature={signature} aria-hidden="true">
          <span className="asset-library-card-monogram">{getAssetMonogram(name)}</span>
        </span>
        <span className="asset-library-card-body">
          <bdi className="asset-library-card-title">{name}</bdi>
          <span className="asset-library-card-footer">
            <span className={`asset-library-card-location ${location.tone}`}>
              {opening ? (
                <InlineLoading label={t("onboarding.status.opening")} size="xs" tone="neutral" />
              ) : (
                <>
                  <AssetLocationIcon tone={location.tone} />
                  <span>{location.label}</span>
                </>
              )}
            </span>
            <span className="asset-library-card-meta">{formatAssetActivity(
              item.lastOpenedAt ?? item.updatedAt,
              t,
              formatDate,
              formatRelativeTime,
            )}</span>
          </span>
        </span>
      </button>
    </article>
  );
}

function AssetLocationIcon({ tone }: { tone: AssetLocationTone }) {
  if (tone === "synced") return <CheckCircle2 size={13} strokeWidth={1.9} aria-hidden="true" />;
  if (tone === "cloud") return <Cloud size={13} strokeWidth={1.9} aria-hidden="true" />;
  if (tone === "linked") return <Link2 size={13} strokeWidth={1.9} aria-hidden="true" />;
  return <Monitor size={13} strokeWidth={1.9} aria-hidden="true" />;
}

function NewProjectCard({
  busy,
  cloudAvailable,
  menuOpen,
  onMenuOpenChange,
  onCreateCloud,
  onChooseFolder,
}: {
  busy: boolean;
  cloudAvailable: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onCreateCloud: () => void;
  onChooseFolder: () => void;
}) {
  const { t } = useLocalization();
  return (
    <div
      className={`asset-library-new-project-wrap ${menuOpen ? "is-open" : ""}`}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          onMenuOpenChange(false);
        }
      }}
    >
      <button
        className="asset-library-new-project"
        type="button"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        disabled={busy}
        onClick={() => onMenuOpenChange(!menuOpen)}
      >
        <span className="asset-library-new-project-body">
          {cloudAvailable ? (
            <span className="asset-library-new-project-cloud-mark" aria-hidden="true">
              <Cloud size={21} strokeWidth={1.65} />
              <Plus size={10} strokeWidth={2} />
            </span>
          ) : (
            <Plus size={19} strokeWidth={1.7} aria-hidden="true" />
          )}
          <span>{t(cloudAvailable ? "onboarding.library.newCloudProject" : "onboarding.library.newProject")}</span>
        </span>
      </button>
      {menuOpen && (
        <div className="asset-library-home-create-menu" role="menu">
          {cloudAvailable && (
            <button type="button" role="menuitem" onClick={onCreateCloud}>
              <Cloud size={15} strokeWidth={1.8} aria-hidden="true" />
              <strong>{t("onboarding.library.createInCloud")}</strong>
            </button>
          )}
          <button type="button" role="menuitem" onClick={onChooseFolder}>
            <Monitor size={15} strokeWidth={1.8} aria-hidden="true" />
            <strong>{t("onboarding.library.addFromMac")}</strong>
          </button>
        </div>
      )}
    </div>
  );
}

function getAssetLocation(item: ProjectHomeItem, t: MessageFormatter): { label: string; tone: AssetLocationTone } {
  if (item.kind === "cloud-local") return { label: t("onboarding.library.location.synced"), tone: "synced" };
  if (item.kind === "cloud-linked") return { label: t("onboarding.library.location.linked"), tone: "linked" };
  if (item.kind === "cloud") return { label: t("onboarding.location.cloud"), tone: "cloud" };
  return { label: t("onboarding.library.location.local"), tone: "local" };
}

function assetHasCloudLocation(item: ProjectHomeItem) {
  return item.kind !== "local" || Boolean(item.cloudProjectId);
}

function assetHasLocalLocation(item: ProjectHomeItem) {
  return Boolean(item.localPath);
}

function getAssetName(item: ProjectHomeItem, untitled: string) {
  const projectName = item.detail?.trim();
  if (projectName && projectName !== item.label) return projectName;

  const source = item.localPath || item.label || untitled;
  const segments = source.replace(/\/$/, "").split("/");
  return segments.at(-1)?.trim() || untitled;
}

function getAssetMonogram(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "P";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

function getAssetSignature(item: ProjectHomeItem) {
  const source = `${item.id}:${item.label}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return String(hash % 4);
}

function getAssetOpeningKey(item: ProjectHomeItem) {
  return item.localPath ?? (item.cloudProjectId ? `cloud:${item.cloudProjectId}` : item.id);
}

function compareAssetActivity(left: ProjectHomeItem, right: ProjectHomeItem) {
  return getAssetActivityTimestamp(right) - getAssetActivityTimestamp(left);
}

function getAssetActivityTimestamp(item: ProjectHomeItem) {
  const value = item.lastOpenedAt ?? item.updatedAt;
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatAssetActivity(
  value: string | null | undefined,
  t: MessageFormatter,
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string,
  formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions) => string,
) {
  if (!value) return t("onboarding.time.previouslyOpened");
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return t("onboarding.time.previouslyOpened");

  const elapsed = Math.max(0, Date.now() - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (elapsed < minute) return formatRelativeTime(0, "second", { numeric: "auto" });
  if (elapsed < hour) return formatRelativeTime(-Math.max(1, Math.floor(elapsed / minute)), "minute", { numeric: "auto" });
  if (elapsed < day) return formatRelativeTime(-Math.max(1, Math.floor(elapsed / hour)), "hour", { numeric: "auto" });
  if (elapsed < week) return formatRelativeTime(-Math.max(1, Math.floor(elapsed / day)), "day", { numeric: "auto" });

  return formatDate(timestamp, { month: "short", day: "numeric", year: "numeric" });
}

function getAssetLibraryOperationStatus(openingKey: string | null, t: MessageFormatter): OnboardingOperationStatus | null {
  if (!openingKey) return null;
  if (openingKey === "__cloud__") {
    return { title: t("onboarding.operation.creatingCloud.title"), detail: t("onboarding.operation.creatingCloud.detail") };
  }
  if (openingKey === "__new__") {
    return { title: t("onboarding.operation.choosingFolder.title"), detail: t("onboarding.operation.choosingFolder.detail") };
  }
  if (openingKey.startsWith("cloud:")) {
    return { title: t("onboarding.operation.openingCloud.title"), detail: t("onboarding.operation.openingCloud.detail") };
  }
  return { title: t("onboarding.operation.openingLocal.title"), detail: t("onboarding.operation.openingLocal.detail") };
}

function createLegacyAssetItems(
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
