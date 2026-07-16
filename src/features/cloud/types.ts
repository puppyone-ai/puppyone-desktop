import type { Workspace } from "@puppyone/shared-ui";
import type { DesktopCloudSession } from "../../lib/cloudApi";
import type { GitStatusSnapshot } from "../../types/electron";
import type { ProjectCloudContext } from "./context";
import type { RepositoryTarget } from "./repositoryTarget";
import type { CloudWorkspaceSection } from "./routes/cloudRouteIds";

export type { CloudWorkspaceSection } from "./routes/cloudRouteIds";

export type CloudGitRemoteOptions = {
  target?: RepositoryTarget;
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
  onStartPuppyoneBackup: () => void;
  onRemoveCloudRemote?: () => Promise<void>;
  onSelectSection: (section: CloudWorkspaceSection) => void;
  onRefresh: () => void;
  onOpenDetails: () => void;
  onOpenGitSettings: () => void;
};
