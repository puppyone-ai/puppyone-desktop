import type { Workspace } from "@puppyone/shared-ui";
import type { DesktopCloudSession } from "../../lib/cloudApi";
import type { GitStatusSnapshot } from "../../types/electron";
import type { ProjectCloudContext } from "./context";
import type { RepositoryTarget } from "./repositoryTarget";
import type { CloudWorkspaceSection } from "./routes/cloudRouteIds";

export type { CloudWorkspaceSection } from "./routes/cloudRouteIds";

export type CloudGitRemoteOptions = {
  target?: RepositoryTarget;
  /** HEAD observed by the caller before an asynchronous Initialize operation began. */
  expectedHeadCommitId?: string;
  /** Attached branch observed by the caller before an asynchronous Initialize operation began. */
  expectedBranch?: string;
  /** Skip reading and writing the workspace-owned `.puppyone/config.json`. */
  persistWorkspacePreferences?: boolean;
  /** Require a write-capable Project and an `rw` credential. */
  requireWrite?: boolean;
  /** Leave status/context publication to the operation that consumes the configured remote. */
  deferStatusPublication?: boolean;
  /** Fail instead of replacing an existing canonical `puppyone` remote. */
  rejectRemoteNameCollision?: boolean;
};

export type CloudServiceSidebarProps = {
  status: GitStatusSnapshot | null;
  cloudSession: DesktopCloudSession | null;
  cloudApiBaseUrl?: string | null;
  activeSection: CloudWorkspaceSection;
  /** True when an authorized Cloud Project context is active — never derived from route alone. */
  projectContext?: boolean;
  /** True when the Project context belongs to the currently open Local workspace. */
  localWorkspaceContext?: boolean;
  /** True when the current Local workspace has not been initialized on PuppyOne Cloud. */
  localOnlyWorkspaceContext?: boolean;
  projectCapabilities?: readonly string[];
  onSelectSection: (section: CloudWorkspaceSection) => void;
  /** Leave an explicit global Project route and return to its parent surface. */
  onBackToProjects?: () => void;
};

export type CloudServicePanelProps = {
  open: boolean;
  status: GitStatusSnapshot | null;
  accountEmail: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onSignedIn: (session: DesktopCloudSession) => void;
  onSignedOut: () => void;
  onEnterCloud: () => void;
  onOpenGitSettings: () => void;
};

export type CloudServiceMainViewProps = {
  workspace: Workspace;
  status: GitStatusSnapshot | null;
  cloudApiBaseUrl: string | null;
  cloudSession: DesktopCloudSession | null;
  sessionRestoring?: boolean;
  projectContext?: ProjectCloudContext | null;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  activeSection: CloudWorkspaceSection;
  loading: boolean;
  error: string | null;
  cloudBackupLoading: boolean;
  cloudBackupPending: boolean;
  cloudBackupError: string | null;
  /** A Cloud Project already exists for an interrupted initialize attempt. */
  cloudBackupProjectInitialized?: boolean;
  /** The interrupted attempt can resume by pushing to the existing Cloud Project. */
  cloudBackupCanRetry?: boolean;
  onStartPuppyoneBackup: () => void;
  onRemoveCloudRemote?: () => Promise<void>;
  onSelectSection: (section: CloudWorkspaceSection) => void;
  onRefresh: () => void;
  onOpenDetails: () => void;
  onOpenGitSettings: () => void;
  onReviewChanges: () => void;
};
