import { AlertTriangle, FolderOpen, Monitor, Plus } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { bidiIsolate, useLocalization } from "@puppyone/localization";
import { createTypographyRootProps } from "../features/typography";
import type { MinimalOnboardingProps, ProjectHomeItem } from "./MinimalOnboarding";
import { DesktopWindowDragRegion } from "./DesktopWindowChrome";
import { InlineLoading } from "./loading";

/** Optional visual home for local repositories; it never enumerates Cloud Projects. */
export function AssetLibraryHome({
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
  const { t, formatDate, formatRelativeTime } = useLocalization();
  const [error, setError] = useState<string | null>(initialError);
  const [dragging, setDragging] = useState(false);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
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
    if (openingPath || operationStatus) return;
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
    if (openingPath || operationStatus) return;
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
      setError(t("onboarding.library.error.dropLocalFolder"));
      return;
    }
    await openPath(path.trim());
  };

  const busy = Boolean(openingPath) || Boolean(operationStatus);
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
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setDragging(false);
      }}
      onDrop={(event) => void handleDrop(event)}
    >
      <DesktopWindowDragRegion className="asset-library-home-titlebar" />
      <section className="asset-library-home" aria-label={t("onboarding.projects.title")}>
        <header className="asset-library-home-header"><div className="asset-library-home-heading"><h1>{t("onboarding.projects.title")}</h1></div></header>

        {operationStatus && (
          <div className="asset-library-home-operation" role="status" aria-live="polite">
            <InlineLoading label={operationStatus.title} size="xs" tone="neutral" />
            {operationStatus.detail && <span>{operationStatus.detail}</span>}
          </div>
        )}
        {error && <div className="asset-library-home-alert" role="alert"><AlertTriangle size={15} /><span>{error}</span></div>}

        <div className="asset-library-home-grid">
          {items.map((item) => (
            <LocalAssetCard
              key={item.id}
              item={item}
              busy={busy}
              opening={openingPath === item.localPath}
              activity={formatActivity(item.lastOpenedAt, t("onboarding.time.previouslyOpened"), formatDate, formatRelativeTime)}
              onOpen={() => void openPath(item.localPath)}
            />
          ))}
          <div className="asset-library-new-project-wrap">
            <button className="asset-library-new-project" type="button" disabled={busy} onClick={() => void chooseFolder()}>
              <span className="asset-library-new-project-body"><Plus size={19} strokeWidth={1.7} /><span>{t("onboarding.library.newProject")}</span></span>
            </button>
          </div>
        </div>
      </section>

      {dragging && <div className="asset-library-home-drop-overlay" aria-hidden="true"><FolderOpen size={24} strokeWidth={1.6} /><strong>{t("onboarding.library.dropOverlay")}</strong></div>}
      {cornerSlot}
    </main>
  );
}

function LocalAssetCard({
  item,
  busy,
  opening,
  activity,
  onOpen,
}: {
  item: ProjectHomeItem;
  busy: boolean;
  opening: boolean;
  activity: string;
  onOpen: () => void;
}) {
  const { t } = useLocalization();
  const name = item.label || item.localPath.split("/").at(-1) || t("onboarding.projects.untitled");
  return (
    <article className={`asset-library-card ${opening ? "is-opening" : ""}`}>
      <button
        className="asset-library-card-main"
        type="button"
        title={item.localPath}
        disabled={busy}
        aria-busy={opening || undefined}
        aria-label={t("onboarding.projects.open", { project: bidiIsolate(name) })}
        onClick={onOpen}
      >
        <span className="asset-library-card-cover" data-signature="0" aria-hidden="true"><span className="asset-library-card-monogram">{name.slice(0, 2).toUpperCase()}</span></span>
        <span className="asset-library-card-body">
          <bdi className="asset-library-card-title">{name}</bdi>
          <span className="asset-library-card-footer">
            <span className="asset-library-card-location local">
              {opening ? <InlineLoading label={t("onboarding.status.opening")} size="xs" tone="neutral" /> : <><Monitor size={13} strokeWidth={1.9} /><span>{t("onboarding.library.location.local")}</span></>}
            </span>
            <span className="asset-library-card-meta">{activity}</span>
          </span>
        </span>
      </button>
    </article>
  );
}

function formatActivity(
  value: string | null | undefined,
  fallback: string,
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string,
  formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions) => string,
) {
  if (!value) return fallback;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return fallback;
  const elapsed = Math.max(0, Date.now() - timestamp);
  const hour = 3_600_000;
  const day = 24 * hour;
  if (elapsed < hour) return formatRelativeTime(-Math.max(1, Math.floor(elapsed / 60_000)), "minute", { numeric: "auto" });
  if (elapsed < day) return formatRelativeTime(-Math.max(1, Math.floor(elapsed / hour)), "hour", { numeric: "auto" });
  if (elapsed < 7 * day) return formatRelativeTime(-Math.max(1, Math.floor(elapsed / day)), "day", { numeric: "auto" });
  return formatDate(timestamp, { month: "short", day: "numeric", year: "numeric" });
}
