import { ExternalLink } from "lucide-react";
import { useLocalization } from "@puppyone/localization/react";
import type {
  DesktopCloudProject,
  DesktopCloudSession,
} from "../../../lib/cloudApi";
import { openCloudApp } from "../../../lib/cloudApi";
import {
  ProjectFolderCard,
  ProjectFolderCardSkeleton,
  ProjectFolderNewCard,
  type ProjectFolderPreviewItem,
} from "../../../components/project-folder-card";
import { DesktopEntryState } from "../../../components/DesktopEntryState";
import { formatRelativeTime } from "../utils";
import { CloudFilePreviewIcon } from "./shared";
import { useCloudProjectPreview } from "../hooks/useCloudProjectPreview";
import { useCloudAuthController } from "../hooks/useCloudAuthController";
import { CloudAuthCard, CloudProductMark } from "../CloudServicePanel";

const PROJECT_CARD_SKELETON_COUNT = 3;

export function CloudProjectBrowser({
  projects,
  loading,
  session,
  apiBaseUrl,
  currentRepositoryProjectId,
  backupLoading,
  cloudAction,
  onSessionChange,
  onBackupWorkspace,
  onSelectProject,
  onConfigureProjectRemote,
  onOpenCloudProjects,
}: {
  projects: DesktopCloudProject[];
  loading: boolean;
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  currentRepositoryProjectId: string | null;
  backupLoading: boolean;
  cloudAction: { kind: "backup" | "configure-remote" | "copy" | null; projectId: string | null };
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onBackupWorkspace: () => void;
  onSelectProject: (project: DesktopCloudProject) => void;
  onConfigureProjectRemote: (project: DesktopCloudProject) => void;
  onOpenCloudProjects: () => void;
}) {
  const { getCollator, t } = useLocalization();
  const collator = getCollator({ sensitivity: "base", numeric: true });
  const sortedProjects = [...projects].sort((left, right) => {
    if (left.id === currentRepositoryProjectId) return -1;
    if (right.id === currentRepositoryProjectId) return 1;
    const leftTime = left.updated_at ? new Date(left.updated_at).getTime() : 0;
    const rightTime = right.updated_at ? new Date(right.updated_at).getTime() : 0;
    return rightTime - leftTime || collator.compare(left.name, right.name);
  });
  const showBackupCard = !currentRepositoryProjectId;
  const actionInProgress = cloudAction.kind !== null || backupLoading;

  return (
    <section className="desktop-cloud-project-browser" aria-label={t("cloud.project.projects")}>
      <div className="desktop-cloud-project-browser-header">
        <div>
          <h1>{t("cloud.project.projects")}</h1>
        </div>
        <button className="desktop-cloud-project-browser-link" type="button" onClick={onOpenCloudProjects}>
          <ExternalLink size={14} />
          <span>{t("cloud.common.openCloud")}</span>
        </button>
      </div>

      <div className="desktop-cloud-project-grid" aria-busy={loading || backupLoading || undefined}>
        {loading && projects.length === 0 ? (
          Array.from({ length: PROJECT_CARD_SKELETON_COUNT }).map((_, index) => (
            <ProjectFolderCardSkeleton key={index} />
          ))
        ) : (
          sortedProjects.map((project) => (
            <CloudProjectCard
              key={project.id}
              project={project}
              session={session}
              apiBaseUrl={apiBaseUrl}
              currentRepositoryProject={project.id === currentRepositoryProjectId}
              remoteBusy={cloudAction.kind === "configure-remote" && cloudAction.projectId === project.id}
              remoteDisabled={actionInProgress}
              onSessionChange={onSessionChange}
              onSelectProject={onSelectProject}
              onConfigureProjectRemote={onConfigureProjectRemote}
            />
          ))
        )}

        {showBackupCard && (
          <CloudProjectNewCard
            loading={backupLoading}
            disabled={actionInProgress}
            onClick={onBackupWorkspace}
          />
        )}
      </div>
    </section>
  );
}

export function CloudProjectBrowserSignedOut({
  apiBaseUrl,
  accountEmail,
  onSignedIn,
  onSignedOut,
  onRefresh,
}: {
  apiBaseUrl: string | null;
  accountEmail: string | null;
  onSignedIn: (session: DesktopCloudSession) => void;
  onSignedOut: () => void;
  onRefresh: () => void | Promise<void>;
}) {
  const { t } = useLocalization();
  const auth = useCloudAuthController({
    cloudApiBaseUrl: apiBaseUrl,
    accountEmail,
    onSignedIn,
    onSignedOut,
    onRefresh,
  });
  const signedIn = Boolean(auth.signedInEmail);

  return (
    <DesktopEntryState
      className="desktop-cloud-project-auth-entry"
      ariaLabel={t("cloud.auth.signInToCloud")}
      visual={(
        <div className="desktop-cloud-login-logo">
          <CloudProductMark />
        </div>
      )}
      title={t("cloud.productName")}
      description={t("cloud.auth.description")}
      action={(
        <CloudAuthCard
          view={signedIn ? "signedIn" : auth.view}
          signedInEmail={auth.signedInEmail}
          signInLabel={t("cloud.auth.signIn")}
          loading={auth.loading}
          signingOut={auth.signingOut}
          error={auth.error}
          message={auth.message}
          onProviderLogin={auth.startProviderLogin}
          onOpenCloud={() => openCloudApp("/projects")}
          onRefresh={onRefresh}
          onSignOut={auth.handleSignOut}
        />
      )}
    />
  );
}

function CloudProjectCard({
  project,
  session,
  apiBaseUrl,
  currentRepositoryProject,
  remoteBusy,
  remoteDisabled,
  onSessionChange,
  onSelectProject,
  onConfigureProjectRemote,
}: {
  project: DesktopCloudProject;
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  currentRepositoryProject: boolean;
  remoteBusy: boolean;
  remoteDisabled: boolean;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onSelectProject: (project: DesktopCloudProject) => void;
  onConfigureProjectRemote: (project: DesktopCloudProject) => void;
}) {
  const localization = useLocalization();
  const { t } = localization;
  const preview = useCloudProjectPreview({
    session,
    projectId: project.id,
    projectRevision: project.updated_at,
    apiBaseUrl,
    onSessionChange,
  });
  const connectionCount = project.access_point_count ?? 0;
  const updatedLabel = project.updated_at ? formatRelativeTime(project.updated_at, localization) : "";
  const previewItems: ProjectFolderPreviewItem[] = preview.entries.map((entry) => ({
    id: entry.path || entry.name,
    name: entry.name || entry.path,
    icon: (
      <CloudFilePreviewIcon
        name={entry.name || entry.path}
        type={entry.type}
        size={28}
        childrenCount={entry.children_count ?? undefined}
      />
    ),
  }));

  return (
    <ProjectFolderCard
      title={project.name}
      badge={currentRepositoryProject ? t("cloud.project.currentRemote") : null}
      previewItems={previewItems}
      previewLoading={preview.loading}
      previewError={preview.error}
      emptyLabel={project.description || t("cloud.project.empty")}
      footer={{
        statusConnected: connectionCount > 0,
        updatedLabel: updatedLabel || t("cloud.project.recentlyUpdated"),
        connectionCount,
      }}
      actions={!currentRepositoryProject ? (
        <button
          type="button"
          className="desktop-project-folder-card-action"
          disabled={remoteDisabled}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onConfigureProjectRemote(project);
          }}
        >
          {t(remoteBusy ? "cloud.project.addingRemote" : "cloud.project.addRemote")}
        </button>
      ) : null}
      onSelect={() => onSelectProject(project)}
    />
  );
}

function CloudProjectNewCard({
  loading,
  disabled,
  onClick,
}: {
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { t } = useLocalization();
  return (
    <ProjectFolderNewCard
      label={t(loading ? "cloud.project.publishingProject" : "cloud.project.publishCurrentProject")}
      loading={loading}
      disabled={disabled}
      onClick={onClick}
    />
  );
}
