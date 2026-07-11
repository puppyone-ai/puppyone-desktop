import type { AiEditRequest, AppPreviewResult, DataNode, FileContent, Workspace } from "@puppyone/shared-ui";
import type {
  AgentAccountReadRequest,
  AgentAccountState,
  AgentApprovalResolution,
  AgentEvent,
  AgentModel,
  AgentModelsListRequest,
  AgentProviderInspection,
  AgentQuestionResolution,
  AgentReplayRequest,
  AgentRuntimeRequest,
  AgentSessionCloseRequest,
  AgentSessionCreateRequest,
  AgentSessionExitEvent,
  AgentSessionListItem,
  AgentSessionMutationRequest,
  AgentSessionResumeRequest,
  AgentSessionSnapshot,
  AgentSessionsListRequest,
  AgentTurnInterruptRequest,
  AgentTurnStartRequest,
  AgentTurnSteerRequest,
} from "../features/desktop-agent/agentTypes";

export type GitStatusEntry = {
  path: string;
  oldPath: string | null;
  staged: string | null;
  unstaged: string | null;
  status: string;
  conflict?: boolean;
};

export type GitSourceControlResourceStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflict"
  | "changed";

export type GitSourceControlResourceGroupId = "merge" | "index" | "workingTree" | "untracked";

export type GitSourceControlResource = {
  id: string;
  group: GitSourceControlResourceGroupId;
  path: string;
  oldPath: string | null;
  status: GitSourceControlResourceStatus;
  staged: boolean;
  conflict: boolean;
  letter: string;
};

export type GitSourceControlResourceGroup = {
  id: GitSourceControlResourceGroupId;
  label: string;
  resources: GitSourceControlResource[];
};

export type GitCommitChangeStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "changed";

export type GitCommitChange = {
  path: string;
  oldPath: string | null;
  status: GitCommitChangeStatus;
  additions: number | null;
  deletions: number | null;
};

export type GitCommitSummary = {
  commit_id: string;
  parent_ids: string[];
  author_name: string;
  author_email: string;
  created_at: string | null;
  message: string;
  graph_prefix?: string;
  graph_continuation_prefixes?: string[];
  changes: GitCommitChange[];
};

export type GitDiffLine = {
  kind: "hunk" | "add" | "remove" | "context";
  text: string;
  oldLine?: number;
  newLine?: number;
};

export type GitRevisionMissingSide = {
  kind: "missing";
  identity: string;
  size: 0;
  mimeType: null;
  reason: string;
};

export type GitRevisionTextSide = {
  kind: "text";
  identity: string;
  size: number;
  mimeType: string | null;
  content: string;
};

export type GitRevisionResourceSide = {
  kind: "resource";
  identity: string;
  size: number;
  mimeType: string | null;
  handle: string;
};

export type GitRevisionUnavailableSide = {
  kind: "unavailable";
  identity: string;
  size: number | null;
  mimeType: string | null;
  reason: string;
  message: string;
};

export type GitRevisionSide =
  | GitRevisionMissingSide
  | GitRevisionTextSide
  | GitRevisionResourceSide
  | GitRevisionUnavailableSide;

export type GitRevisionPair = {
  repositoryIdentity: string;
  selectionIdentity: string;
  sessionId: string;
  scope: GitWorkingDiffScope;
  path: string;
  oldPath: string | null;
  status: GitCommitChangeStatus | "untracked";
  before: GitRevisionSide;
  after: GitRevisionSide;
};

export type GitFileDiff = GitCommitChange & {
  binary: boolean;
  mimeType?: string | null;
  revisionPair?: GitRevisionPair;
  lines: GitDiffLine[];
  truncated?: boolean;
  omittedLines?: number;
};

export type GitCommitDetail = {
  commit_id: string;
  files: GitFileDiff[];
};

export type GitBranchSummary = {
  name: string;
  current: boolean;
  remote: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  lastCommitId: string | null;
  lastCommitMessage: string | null;
  lastCommitDate: string | null;
};

export type GitRemoteSummary = {
  name: string;
  fetchUrl: string | null;
  pushUrl: string | null;
  branches: string[];
};

export type GitSyncTargetSummary = {
  remote: string | null;
  branch: string | null;
  ref: string | null;
  exists: boolean;
  ahead: number;
  behind: number;
  incomingPreview: GitSourceControlResource[];
  outgoingPreview: GitSourceControlResource[];
};

export type GitSourceControlRemoteSummary = {
  target: GitSyncTargetSummary | null;
  currentBranch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  incomingPreview: GitSourceControlResource[];
  outgoingPreview: GitSourceControlResource[];
  canPull: boolean;
  canPush: boolean;
  canSync: boolean;
  canPublish: boolean;
  state:
    | "no-repository"
    | "no-remote"
    | "no-branch"
    | "publish"
    | "incoming"
    | "outgoing"
    | "diverged"
    | "synced";
};

export type GitSourceControlSnapshot = {
  input: {
    placeholder: string;
    defaultMessage: string;
  };
  groups: GitSourceControlResourceGroup[];
  remote: GitSourceControlRemoteSummary;
  actions: {
    canStageAll: boolean;
    canUnstageAll: boolean;
    canDiscardAll: boolean;
    canCommit: boolean;
  };
};

export type GitWorkingDiffScope = "staged" | "unstaged" | "untracked" | "remote" | "committed";

export type GitEffectiveHostingKind = "github" | "puppyone-cloud" | "generic-git" | "local-only";

export type GitEffectiveHostingReason =
  | "configured"
  | "remote-detected"
  | "upstream-detected"
  | "missing-remote"
  | "local-only"
  | "no-repository";

export type GitEffectiveHostingIdentity = {
  provider: Extract<GitEffectiveHostingKind, "github" | "puppyone-cloud">;
  label: string;
  href: string | null;
};

export type GitEffectiveHosting = {
  kind: GitEffectiveHostingKind;
  remoteName: string | null;
  branchName: string | null;
  ref: string | null;
  ready: boolean;
  reason: GitEffectiveHostingReason;
  identity: GitEffectiveHostingIdentity | null;
};

export type GitStatusSnapshot = {
  isRepo: boolean;
  branch: string | null;
  headCommitId: string | null;
  totalCommits: number;
  entries: GitStatusEntry[];
  stagedEntries: GitStatusEntry[];
  unstagedEntries: GitStatusEntry[];
  untrackedEntries: GitStatusEntry[];
  branches: GitBranchSummary[];
  remotes: GitRemoteSummary[];
  syncTarget: GitSyncTargetSummary | null;
  effectiveHosting: GitEffectiveHosting;
  sourceControl: GitSourceControlSnapshot;
  commits: GitCommitSummary[];
  allCommits: GitCommitSummary[];
  statusLimit: number;
  didHitStatusLimit: boolean;
};

export type GitBranchGraphSnapshot = {
  isRepo: boolean;
  branch: string | null;
  headCommitId: string | null;
  branches: GitBranchSummary[];
  commits: GitCommitSummary[];
  allCommits: GitCommitSummary[];
};

export type TerminalCreateRequest = {
  id: string;
  cwd: string;
  cols: number;
  rows: number;
};

export type TerminalCreateResult = {
  id: string;
  pid: number | null;
  shell: string;
  cwd: string;
};

export type TerminalInputRequest = {
  id: string;
  data: string;
};

export type TerminalResizeRequest = {
  id: string;
  cols: number;
  rows: number;
};

export type TerminalDataEvent = {
  id: string;
  data: string;
};

export type TerminalExitEvent = {
  id: string;
  code: number | null;
  signal: string | null;
};

export type DesktopUpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "not-available"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "blocked"
  | "error";

export type DesktopUpdateInfo = {
  version: string | null;
  releaseName: string | null;
  releaseDate: string | null;
  releaseNotes: string | null;
} | null;

export type DesktopUpdateProgress = {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
} | null;

export type DesktopUpdateBlocker = {
  id: string;
  label: string;
  detail: string | null;
};

export type DesktopUpdateState = {
  status: DesktopUpdateStatus;
  currentVersion: string;
  channel: "stable" | "beta" | "internal";
  availableVersion: string | null;
  updateInfo: DesktopUpdateInfo;
  progress: DesktopUpdateProgress;
  blockers: DesktopUpdateBlocker[];
  error: string | null;
  reason: string | null;
  lastCheckedAt: string | null;
  updatedAt: string;
};

export type WorkspaceChangedEvent = {
  rootPath: string;
  eventType: string;
  path: string | null;
  error?: string;
  recovered?: boolean;
  reason?: string;
};

export type AiEditReviewUpdatedEvent = {
  rootPath: string;
  request: AiEditRequest;
};

export type GitRepositoryWatchResult = {
  subscriptionId: string;
  rootPath: string;
  repository: boolean;
};

export type GitRepositoryInvalidatedEvent = {
  subscriptionId: string;
  rootPath: string;
  reason: string;
};

export type GitRepositoryWindowFocusEvent = {
  focused: boolean;
};

export type LastWorkspaceResult = {
  path: string | null;
  workspace: Workspace | null;
  error: string | null;
};

export type RecentWorkspacesResult = {
  workspaces: Workspace[];
  items?: Array<{
    workspace: Workspace;
    lastOpenedAt: string | null;
  }>;
  errors: Array<{
    path: string;
    error: string;
  }>;
  hydrated?: boolean;
};

export type WorkspaceOpenResult = {
  status: "opened-current" | "opened-new-window" | "focused-existing";
  path: string | null;
  workspace: Workspace | null;
};

export type WorkspaceCreateEntryKind = "file" | "folder";

export type WorkspaceCreateEntryRequest = {
  rootPath: string;
  parentPath: string | null;
  name: string;
  kind: WorkspaceCreateEntryKind;
  content?: string;
};

export type WorkspaceCreateEntryResult = {
  path: string;
};

export type WorkspaceRenameEntryRequest = {
  rootPath: string;
  path: string;
  nextName: string;
};

export type WorkspaceMoveEntryRequest = {
  rootPath: string;
  fromPath: string;
  toPath: string;
};

export type WorkspaceCopyEntryRequest = {
  rootPath: string;
  fromPath: string;
  targetFolderPath: string | null;
  preferredName?: string;
  forceDuplicateName?: boolean;
};

export type WorkspaceImportEntriesRequest = {
  rootPath: string;
  targetFolderPath: string | null;
  files: File[];
};

export type WorkspaceImportEntriesResult = {
  paths: string[];
};

export type WorkspaceDeleteEntryRequest = {
  rootPath: string;
  path: string;
};

export type WorkspaceRevealEntryRequest = {
  rootPath: string;
  path: string;
};

export type WorkspaceConvertOfficeDocumentToDocxRequest = {
  rootPath: string;
  path: string;
  requestId: string;
};

export type WorkspaceCancelOfficeDocumentToDocxRequest = {
  requestId: string;
};

export type WorkspaceCancelOfficeDocumentToDocxResult = {
  cancelled: boolean;
};

export type WorkspaceConvertOfficeDocumentToDocxResult = {
  bytes: ArrayBuffer;
  warnings?: string[];
};

export type WorkspaceOpenEntryExternalRequest = {
  rootPath: string;
  path: string;
  strategy?: "system" | "app";
  appPath?: string | null;
};

export type WorkspaceExternalOpenTargetSource = "system" | "override" | "candidate" | "unknown";

export type WorkspaceExternalOpenTarget = {
  appName: string | null;
  appPath: string | null;
  bundleId: string | null;
  extension: string | null;
  iconDataUrl: string | null;
  source: WorkspaceExternalOpenTargetSource;
};

export type WorkspaceResolveExternalOpenTargetRequest = {
  rootPath: string;
  path: string;
  extension?: string | null;
  overrideAppPath?: string | null;
};

export type WorkspaceChooseExternalAppRequest = {
  extension?: string | null;
};

export type DesktopStoredCloudSession = {
  expires_in: number;
  expires_at: number;
  user_id: string;
  user_email: string;
  api_base_url: string;
  session_generation: string;
  status: DesktopCloudAuthStatus;
};

export type DesktopCloudAuthStatus =
  | "restoring"
  | "signing-in"
  | "authenticated"
  | "refreshing"
  | "offline-authenticated"
  | "signing-out"
  | "expired"
  | "signed-out";

export type DesktopCloudAuthStateSnapshot = {
  status: DesktopCloudAuthStatus;
  session: DesktopStoredCloudSession | null;
};

export type PuppyoneBackendService = "puppyone" | "github" | "custom";

export type PuppyoneWorkspaceConfig = {
  version: 2;
  project: {
    id: string | null;
  };
  sync: {
    sourceOfTruth: {
      service: PuppyoneBackendService;
      remote: string | null;
      branch: string | null;
    };
  };
  git: {
    primaryRemote: string | null;
    watchedBranch: string | null;
  };
  backup: {
    enabled: boolean;
    service: PuppyoneBackendService;
    remote: string | null;
    branch: string | null;
  };
  cloud: {
    projectId: string | null;
  };
  updatedAt?: string;
};

declare global {
  interface Window {
    puppyoneDesktop?: {
      readCloudSession: () => Promise<DesktopStoredCloudSession | null>;
      readCloudAuthState: () => Promise<DesktopCloudAuthStateSnapshot>;
      restoreCloudSession: (request: {
        apiBaseUrl?: string | null;
      }) => Promise<DesktopStoredCloudSession | null>;
      startCloudOAuth: (request: {
        apiBaseUrl: string;
        provider?: "google" | "github";
      }) => Promise<{ ok: boolean }>;
      clearCloudSession: () => Promise<void>;
      onCloudSessionChanged: (
        callback: (session: DesktopStoredCloudSession | null) => void,
      ) => () => void;
      onCloudAuthStateChanged: (
        callback: (state: DesktopCloudAuthStateSnapshot) => void,
      ) => () => void;
      onCloudAuthError: (
        callback: (payload: { message?: string }) => void,
      ) => () => void;
      requestCloudApi: (request: {
        apiBaseUrl: string;
        path: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      }) => Promise<unknown>;
      requestCloudSessionApi: (request: {
        apiBaseUrl: string;
        path: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      }) => Promise<unknown>;
      listCloudAccessPointDirectory: (request: {
        accessKey: string;
        path?: string;
        userEmail?: string | null;
        remoteUrl?: string | null;
        apiBaseUrl?: string | null;
      }) => Promise<{
        path: string;
        entries: Array<{
          name: string;
          path: string;
          type: string;
          content_hash?: string | null;
          size_bytes?: number | null;
          mime_type?: string | null;
          children_count?: number | null;
          integrity_status?: "ok" | "damaged" | "unknown";
        }>;
        head_commit_id?: string;
      }>;
      getCloudAccessPointSemantics: (request: {
        accessKey: string;
        userEmail?: string | null;
        remoteUrl?: string | null;
        apiBaseUrl?: string | null;
      }) => Promise<{
        project_id?: string;
        scope?: {
          id?: string;
          project_id?: string;
          repo_id?: string;
          repo_kind?: string;
          repo_ref?: string;
          path?: string;
          mode?: string;
          exclude?: string[];
        };
      }>;
      openExternalUrl: (href: string) => Promise<{ ok: boolean }>;
      markdownWebEmbed: {
        create: (request: {
          href: string;
          bounds?: { x: number; y: number; width: number; height: number };
          capability: {
            editorViewId: string;
            workspaceId: string;
            documentPath: string;
            documentRevision: string;
            purpose: "web-embed";
            executionSessionId?: string;
          };
        }) => Promise<{ id: string; href?: string; visible?: boolean }>;
        setBounds: (request: {
          id: string;
          bounds: { x: number; y: number; width: number; height: number };
        }) => Promise<{ ok?: boolean; visible?: boolean } | void>;
        destroy: (request: { id: string }) => Promise<{ ok?: boolean } | void>;
      };
      setDockIcon: (iconId: "polished" | "light" | "matte") => Promise<{
        supported: boolean;
        iconId: "polished" | "light" | "matte";
        applied?: boolean;
      }>;
      getInitialWorkspace: () => Promise<LastWorkspaceResult>;
      getLastWorkspace: () => Promise<LastWorkspaceResult>;
      getRecentWorkspaces: () => Promise<RecentWorkspacesResult>;
      hydrateRecentWorkspaces: () => Promise<RecentWorkspacesResult>;
      forgetLastWorkspace: () => Promise<void>;
      showHomepage: () => Promise<{ ok: boolean }>;
      openWorkspaceInCurrentWindow: (folderPath: string) => Promise<WorkspaceOpenResult>;
      openWorkspaceInNewWindow: (folderPath: string) => Promise<WorkspaceOpenResult>;
      openCloudProjectInNewWindow: (request: { projectId: string; name: string }) => Promise<WorkspaceOpenResult>;
      selectFolder: () => Promise<WorkspaceOpenResult | null>;
      selectFolderInNewWindow: () => Promise<WorkspaceOpenResult | null>;
      getPathForFile: (file: File) => string;
      listFolderChildren: (request: {
        rootPath: string;
        folderPath: string | null;
      }) => Promise<DataNode[]>;
      readFile: (request: {
        rootPath: string;
        path: string;
      }) => Promise<FileContent>;
      getFileUrl: (request: {
        rootPath: string;
        path: string;
        purpose?: "file-preview" | "markdown-asset";
      }) => Promise<{ url: string }>;
      revokeFileUrl: (request: { url: string }) => Promise<{ revoked: boolean }>;
      convertOfficeDocumentToDocx: (
        request: WorkspaceConvertOfficeDocumentToDocxRequest,
      ) => Promise<WorkspaceConvertOfficeDocumentToDocxResult>;
      cancelOfficeDocumentToDocxConversion: (
        request: WorkspaceCancelOfficeDocumentToDocxRequest,
      ) => Promise<WorkspaceCancelOfficeDocumentToDocxResult>;
      writeFile: (request: {
        rootPath: string;
        path: string;
        content: string;
      }) => Promise<void>;
      createEntry: (request: WorkspaceCreateEntryRequest) => Promise<WorkspaceCreateEntryResult>;
      renameEntry: (request: WorkspaceRenameEntryRequest) => Promise<WorkspaceCreateEntryResult>;
      moveEntry: (request: WorkspaceMoveEntryRequest) => Promise<WorkspaceCreateEntryResult>;
      copyEntry: (request: WorkspaceCopyEntryRequest) => Promise<WorkspaceCreateEntryResult>;
      importEntries: (request: WorkspaceImportEntriesRequest) => Promise<WorkspaceImportEntriesResult>;
      deleteEntry: (request: WorkspaceDeleteEntryRequest) => Promise<WorkspaceCreateEntryResult>;
      revealEntryInFinder: (request: WorkspaceRevealEntryRequest) => Promise<{ ok: boolean }>;
      openEntryExternal: (request: WorkspaceOpenEntryExternalRequest) => Promise<{ ok: boolean; cancelled?: boolean }>;
      resolveExternalOpenTarget: (request: WorkspaceResolveExternalOpenTargetRequest) => Promise<WorkspaceExternalOpenTarget>;
      listExternalOpenTargets: (request: WorkspaceResolveExternalOpenTargetRequest) => Promise<WorkspaceExternalOpenTarget[]>;
      chooseExternalApp: (request: WorkspaceChooseExternalAppRequest) => Promise<WorkspaceExternalOpenTarget | null>;
      startAppPreview: (request: {
        rootPath: string;
        path: string;
      }) => Promise<AppPreviewResult>;
      restartAppPreview: (request: {
        rootPath: string;
        path: string;
      }) => Promise<AppPreviewResult>;
      stopAppPreview: (request: {
        rootPath: string;
        path: string;
      }) => Promise<AppPreviewResult>;
      getAppPreviewLogs: (request: {
        rootPath: string;
        path: string;
      }) => Promise<string>;
      openAppPreviewExternal: (request: {
        rootPath: string;
        path: string;
      }) => Promise<{ ok: boolean }>;
      watchWorkspace: (
        rootPath: string,
        callback: (event: WorkspaceChangedEvent) => void,
      ) => {
        stop: () => void;
        ready: Promise<{ subscriptionId: string | null; rootPath: string }>;
      };
      startGitRepositoryWatch: (request: {
        rootPath: string;
      }) => Promise<GitRepositoryWatchResult>;
      stopGitRepositoryWatch: (request: {
        subscriptionId: string;
      }) => Promise<{ ok: boolean }>;
      onGitRepositoryInvalidated: (
        callback: (event: GitRepositoryInvalidatedEvent) => void,
      ) => () => void;
      onGitRepositoryWindowFocus?: (
        callback: (event: GitRepositoryWindowFocusEvent) => void,
      ) => () => void;
      getLatestAiEditReviewRequest: (request: {
        rootPath: string;
      }) => Promise<AiEditRequest | null>;
      onAiEditReviewUpdated: (
        callback: (event: AiEditReviewUpdatedEvent) => void,
      ) => () => void;
      getGitStatus: (request: {
        rootPath: string;
        requestId?: string;
      }) => Promise<GitStatusSnapshot>;
      cancelGitStatus?: (request: {
        requestId: string;
      }) => Promise<{ ok: boolean }>;
      getGitBranchGraph?: (request: {
        rootPath: string;
        requestId?: string;
      }) => Promise<GitBranchGraphSnapshot>;
      cancelGitBranchGraph?: (request: {
        requestId: string;
      }) => Promise<{ ok: boolean }>;
      initGitRepository: (request: {
        rootPath: string;
      }) => Promise<GitStatusSnapshot>;
      configureGitCloudRemote: (request: {
        rootPath: string;
        remoteUrl: string;
        remoteName?: string;
      }) => Promise<GitStatusSnapshot>;
      readPuppyoneConfig: (request: {
        rootPath: string;
      }) => Promise<PuppyoneWorkspaceConfig>;
      writePuppyoneConfig: (request: {
        rootPath: string;
        config: PuppyoneWorkspaceConfig;
      }) => Promise<PuppyoneWorkspaceConfig>;
      regeneratePuppyoneProjectId: (request: {
        rootPath: string;
        preserveCloudBinding?: boolean;
      }) => Promise<PuppyoneWorkspaceConfig>;
      getGitCommitDetail: (request: {
        rootPath: string;
        commitId: string;
      }) => Promise<GitCommitDetail>;
      getGitFileDiff: (request: {
        rootPath: string;
        path: string;
        scope: GitWorkingDiffScope;
        requestId?: string;
        sessionId?: string;
      }) => Promise<GitCommitDetail>;
      cancelGitFileDiff?: (request: {
        requestId: string;
        sessionId: string;
      }) => Promise<{ ok: boolean }>;
      readGitDiffResource: (request: {
        handle: string;
        sessionId: string;
        selectionIdentity: string;
        revisionIdentity: string;
      }) => Promise<{
        bytes: Uint8Array;
        size: number;
        selectionIdentity: string;
        revisionIdentity: string;
      }>;
      releaseGitDiffResources: (request: {
        sessionId: string;
      }) => Promise<{ ok: boolean }>;
      stageGitPaths: (request: {
        rootPath: string;
        paths: string[];
      }) => Promise<GitStatusSnapshot>;
      stageAllGitChanges: (request: {
        rootPath: string;
      }) => Promise<GitStatusSnapshot>;
      unstageGitPaths: (request: {
        rootPath: string;
        paths: string[];
      }) => Promise<GitStatusSnapshot>;
      unstageAllGitChanges: (request: {
        rootPath: string;
      }) => Promise<GitStatusSnapshot>;
      discardGitPaths: (request: {
        rootPath: string;
        paths: string[];
      }) => Promise<GitStatusSnapshot>;
      discardAllGitChanges: (request: {
        rootPath: string;
      }) => Promise<GitStatusSnapshot>;
      commitGit: (request: {
        rootPath: string;
        message: string;
      }) => Promise<GitStatusSnapshot>;
      checkoutGitBranch: (request: {
        rootPath: string;
        branchName: string;
        remote: boolean;
      }) => Promise<GitStatusSnapshot>;
      stashAndCheckoutGitBranch: (request: {
        rootPath: string;
        branchName: string;
        remote: boolean;
      }) => Promise<GitStatusSnapshot>;
      commitAndCheckoutGitBranch: (request: {
        rootPath: string;
        branchName: string;
        remote: boolean;
      }) => Promise<GitStatusSnapshot>;
      createGitBranch: (request: {
        rootPath: string;
        branchName: string;
      }) => Promise<GitStatusSnapshot>;
      fetchGit: (request: {
        rootPath: string;
      }) => Promise<GitStatusSnapshot>;
      pullGit: (request: {
        rootPath: string;
        showNativeErrorDialog?: boolean;
      }) => Promise<GitStatusSnapshot>;
      pushGit: (request: {
        rootPath: string;
        showNativeErrorDialog?: boolean;
      }) => Promise<GitStatusSnapshot>;
      publishGitBranch: (request: {
        rootPath: string;
        remoteName?: string | null;
      }) => Promise<GitStatusSnapshot>;
      syncGit: (request: {
        rootPath: string;
      }) => Promise<GitStatusSnapshot>;
      getUpdateState: () => Promise<DesktopUpdateState>;
      checkForUpdates: () => Promise<DesktopUpdateState>;
      downloadUpdate: () => Promise<DesktopUpdateState>;
      updateNow: () => Promise<DesktopUpdateState>;
      installUpdate: () => Promise<DesktopUpdateState>;
      onUpdateStateChanged: (
        callback: (state: DesktopUpdateState) => void,
      ) => () => void;
      discoverAgentProviders: (request?: AgentRuntimeRequest) => Promise<AgentProviderInspection>;
      listAgentModels: (request?: AgentModelsListRequest) => Promise<AgentModel[]>;
      readAgentAccount: (request?: AgentAccountReadRequest) => Promise<AgentAccountState | null>;
      createAgentSession: (request: AgentSessionCreateRequest) => Promise<AgentSessionSnapshot>;
      resumeAgentSession: (request: AgentSessionResumeRequest) => Promise<AgentSessionSnapshot | null>;
      replayAgentSession: (request: AgentReplayRequest) => Promise<AgentSessionSnapshot>;
      listAgentSessions: (request: AgentSessionsListRequest) => Promise<AgentSessionListItem[]>;
      forkAgentSession: (request: AgentSessionMutationRequest) => Promise<AgentSessionSnapshot>;
      archiveAgentSession: (request: AgentSessionMutationRequest) => Promise<{ sessionId: string; archived: boolean }>;
      deleteAgentSession: (request: AgentSessionMutationRequest) => Promise<{ sessionId: string; deleted: boolean; nativeDeleted: boolean }>;
      closeAgentSession: (request: AgentSessionCloseRequest) => Promise<{ sessionId: string; closed: boolean }>;
      startAgentTurn: (request: AgentTurnStartRequest) => Promise<{ sessionId: string; turnId: string }>;
      steerAgentTurn: (request: AgentTurnSteerRequest) => Promise<{
        sessionId: string;
        turnId: string;
        steered: boolean;
      }>;
      interruptAgentTurn: (request: AgentTurnInterruptRequest) => Promise<{
        sessionId: string;
        turnId: string;
        interruptRequested: boolean;
      }>;
      compactAgentSession: (request: { rootPath: string; sessionId: string }) => Promise<{ sessionId: string; compacted: boolean }>;
      resolveAgentApproval: (request: AgentApprovalResolution) => Promise<{
        sessionId: string;
        requestId: string;
        decision: AgentApprovalResolution["decision"];
      }>;
      resolveAgentQuestion: (request: AgentQuestionResolution) => Promise<{
        sessionId: string;
        requestId: string;
      }>;
      onAgentEvent: (callback: (event: AgentEvent) => void) => () => void;
      onAgentSessionExit: (callback: (event: AgentSessionExitEvent) => void) => () => void;
      viewerPacks?: {
        getSnapshot: () => Promise<import("@puppyone/shared-ui").ViewerPackSnapshot>;
        installLocal: () => Promise<
          | { canceled: true }
          | { canceled: false; pluginId: string; version: string; contentHash: string }
        >;
        disable: (request: { pluginId: string }) => Promise<{ ok: boolean; reason?: string }>;
        uninstall: (request: { pluginId: string }) => Promise<{ ok: boolean; canceled?: boolean }>;
        activate: (request: {
          pluginId: string;
          rootPath: string;
          relativePath: string;
          bounds?: { x: number; y: number; width: number; height: number };
        }) => Promise<import("@puppyone/shared-ui").ViewerPackSessionDescriptor>;
        setBounds: (request: {
          sessionId: string;
          bounds: { x: number; y: number; width: number; height: number };
        }) => Promise<{ ok: boolean }>;
        destroySession: (request: { sessionId: string }) => Promise<{ ok: boolean }>;
        onSessionState: (callback: (payload: {
          sessionId: string;
          state: {
            status: "loading" | "ready" | "error";
            message?: string;
            progress?: number;
          };
        }) => void) => () => void;
      };
      createTerminal: (request: TerminalCreateRequest) => Promise<TerminalCreateResult>;
      writeTerminal: (request: TerminalInputRequest) => void;
      resizeTerminal: (request: TerminalResizeRequest) => void;
      closeTerminal: (id: string) => Promise<void>;
      onTerminalData: (callback: (event: TerminalDataEvent) => void) => () => void;
      onTerminalExit: (callback: (event: TerminalExitEvent) => void) => () => void;
    };
  }
}

export {};
