import { ExternalLink } from "lucide-react";
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
  mappedProjectId,
  backupLoading,
  cloudAction,
  onSessionChange,
  onBackupWorkspace,
  onSelectProject,
  onConnectProject,
  onOpenCloudProjects,
}: {
  projects: DesktopCloudProject[];
  loading: boolean;
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  mappedProjectId: string | null;
  backupLoading: boolean;
  cloudAction: { kind: "backup" | "connect" | "copy" | null; projectId: string | null };
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onBackupWorkspace: () => void;
  onSelectProject: (project: DesktopCloudProject) => void;
  onConnectProject: (project: DesktopCloudProject) => void;
  onOpenCloudProjects: () => void;
}) {
  const sortedProjects = [...projects].sort((left, right) => {
    if (left.id === mappedProjectId) return -1;
    if (right.id === mappedProjectId) return 1;
    const leftTime = left.updated_at ? new Date(left.updated_at).getTime() : 0;
    const rightTime = right.updated_at ? new Date(right.updated_at).getTime() : 0;
    return rightTime - leftTime || left.name.localeCompare(right.name);
  });
  const showBackupCard = !mappedProjectId;
  const actionInProgress = cloudAction.kind !== null || backupLoading;

  return (
    <section className="desktop-cloud-project-browser" aria-label="Cloud projects">
      <div className="desktop-cloud-project-browser-header">
        <div>
          <h1>Cloud Projects</h1>
        </div>
        <button className="desktop-cloud-project-browser-link" type="button" onClick={onOpenCloudProjects}>
          <ExternalLink size={14} />
          <span>Open Cloud</span>
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
              mapped={project.id === mappedProjectId}
              attachBusy={cloudAction.kind === "connect" && cloudAction.projectId === project.id}
              attachDisabled={actionInProgress}
              onSessionChange={onSessionChange}
              onSelectProject={onSelectProject}
              onConnectProject={onConnectProject}
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
  const auth = useCloudAuthController({
    cloudApiBaseUrl: apiBaseUrl,
    accountEmail,
    onSignedIn,
    onSignedOut,
    onRefresh,
  });
  const signedIn = Boolean(auth.signedInEmail);

  return (
    <section className="desktop-cloud-project-auth-stage" aria-label="Sign in to Puppyone Cloud">
      <div className="desktop-cloud-project-auth-body">
        <div className="desktop-cloud-project-auth-shell">
          <div className="desktop-cloud-project-auth-visual" aria-hidden="true">
            <div className="desktop-cloud-login-logo">
              <CloudProductMark />
            </div>
          </div>
          <div className="desktop-cloud-project-auth-content">
            <header className="desktop-cloud-project-auth-copy">
              <h1>Puppyone Cloud</h1>
            </header>
            <p className="desktop-cloud-project-auth-description">
              Back up this workspace, collaborate with your team, and keep MCP and CLI access available around the clock.
            </p>
            <div className="desktop-cloud-project-auth-action">
              <CloudAuthCard
                view={signedIn ? "signedIn" : auth.view}
                signedInEmail={auth.signedInEmail}
                signInLabel="Sign in"
                loading={auth.loading}
                signingOut={auth.signingOut}
                error={auth.error}
                message={auth.message}
                onProviderLogin={auth.startProviderLogin}
                onOpenCloud={() => openCloudApp("/projects")}
                onRefresh={onRefresh}
                onSignOut={auth.handleSignOut}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CloudProjectCard({
  project,
  session,
  apiBaseUrl,
  mapped,
  attachBusy,
  attachDisabled,
  onSessionChange,
  onSelectProject,
  onConnectProject,
}: {
  project: DesktopCloudProject;
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  mapped: boolean;
  attachBusy: boolean;
  attachDisabled: boolean;
  onSessionChange: (session: DesktopCloudSession | null) => void;
  onSelectProject: (project: DesktopCloudProject) => void;
  onConnectProject: (project: DesktopCloudProject) => void;
}) {
  const preview = useCloudProjectPreview({
    session,
    projectId: project.id,
    projectRevision: project.updated_at,
    apiBaseUrl,
    onSessionChange,
  });
  const connectionCount = project.access_point_count ?? 0;
  const updatedLabel = project.updated_at ? formatRelativeTime(project.updated_at) : "";
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
      badge={mapped ? "Linked" : null}
      previewItems={previewItems}
      previewLoading={preview.loading}
      previewError={preview.error}
      emptyLabel={project.description || "Empty project"}
      footer={{
        statusConnected: connectionCount > 0,
        updatedLabel: updatedLabel || "Recently updated",
        connectionCount,
      }}
      actions={!mapped ? (
        <button
          type="button"
          className="desktop-project-folder-card-action"
          disabled={attachDisabled}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onConnectProject(project);
          }}
        >
          {attachBusy ? "Linking…" : "Link folder"}
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
  return (
    <ProjectFolderNewCard
      label={loading ? "Creating backup…" : "Back up current folder"}
      loading={loading}
      disabled={disabled}
      onClick={onClick}
    />
  );
}
