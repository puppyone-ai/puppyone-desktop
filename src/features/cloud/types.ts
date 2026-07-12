import type { Workspace } from "@puppyone/shared-ui";
import type { DesktopCloudSession } from "../../lib/cloudApi";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../types/electron";
import type { ProjectCloudAttachment } from "./attachment";
import type { CloudWorkspaceSection } from "./routes/cloudRouteIds";

export type { CloudWorkspaceSection } from "./routes/cloudRouteIds";

export type CloudWorkspaceAttachOptions = {
  bindingKind?: "full" | "scoped";
  scopeId?: string | null;
};

export type CloudServiceSidebarProps = {
  status: GitStatusSnapshot | null;
  cloudSession: DesktopCloudSession | null;
  cloudApiBaseUrl?: string | null;
  activeSection: CloudWorkspaceSection;
  /** True when a bound or explicitly selected Cloud project is active — not derived from route alone. */
  projectContext?: boolean;
  /** True only when this project is structurally bound to the local workspace. */
  projectBound?: boolean;
  projectCapabilities?: readonly string[];
  onSelectSection: (section: CloudWorkspaceSection) => void;
  /** Clear browsing selection and return to the Cloud Projects list. */
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
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  cloudApiBaseUrl: string | null;
  cloudSession: DesktopCloudSession | null;
  sessionRestoring?: boolean;
  attachment?: ProjectCloudAttachment | null;
  onCloudSessionChange: (session: DesktopCloudSession | null) => void;
  activeSection: CloudWorkspaceSection;
  selectedProjectId?: string | null;
  loading: boolean;
  error: string | null;
  cloudBackupLoading: boolean;
  cloudBackupError: string | null;
  onStartPuppyoneBackup: () => void;
  onConfigureCloudRemote: (
    remoteUrl: string,
    projectId?: string | null,
    options?: CloudWorkspaceAttachOptions,
  ) => Promise<GitStatusSnapshot | null>;
  onDetachCloudProject?: () => Promise<void>;
  onSelectProjectId?: (projectId: string | null) => void;
  onSelectSection: (section: CloudWorkspaceSection) => void;
  onRefresh: () => void;
  onOpenDetails: () => void;
  onOpenGitSettings: () => void;
};
