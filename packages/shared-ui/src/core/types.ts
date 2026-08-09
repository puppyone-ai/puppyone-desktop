export type DataNodeKind =
  | "folder"
  | "app"
  | "workflow"
  | "markdown"
  | "json"
  | "html"
  | "image"
  | "audio"
  | "pdf"
  | "video"
  | "spreadsheet"
  | "archive"
  | "document"
  | "binary"
  | "code"
  | "text"
  | "file";

export type DataNodeStatus = "clean" | "modified" | "created" | "deleted" | "moved";

export type DataSourceKind =
  | "local"
  | "cloud"
  | "github"
  | "notion"
  | "google_drive"
  | "connector";

export type Workspace = {
  id: string;
  name: string;
  path: string;
  status: "protected" | "recording" | "paused";
  commitCount?: number;
  cloudState?: "local" | "syncing" | "synced";
  /** Secret-free canonical PuppyOne Git locator cached for recent-workspace UI. */
  puppyoneGitRemote?: {
    origin: string;
    projectId: string;
    scopeId?: string | null;
  } | null;
  projectId?: string | null;
  workspaceInstanceId?: string;
  fsIdentity?: string;
  hydrationState?: "metadata" | "loading" | "ready" | "error";
  configError?: string;
  /** Host-resolved Markdown grammar; never inferred from document contents. */
  markdownDialect?: "puppy-gfm" | "openknowledge-mdx";
};

export type DataNode = {
  id: string;
  name: string;
  path: string;
  type: DataNodeKind;
  mimeType?: string | null;
  size?: string | null;
  modified?: string | null;
  status?: DataNodeStatus;
  preview?: string | null;
  content?: string | null;
  hasChildren?: boolean;
  children?: DataNode[] | null;
  source?: DataSourceKind;
};

export type FileContent = {
  path: string;
  name: string;
  type: DataNodeKind;
  content?: string | null;
  mimeType?: string | null;
  size?: string | null;
  url?: string | null;
  /** Storage revision/fingerprint used as the next conditional-write base. */
  version?: string | null;
};

export type AppPreviewStatus = "starting" | "running" | "stopped" | "error";

export type AppPreviewPackageManager = "npm" | "pnpm" | "yarn" | "bun";

export type AppPreviewProjectCandidate = Readonly<{
  id: string;
  cwd: string;
  directoryLabel: string;
  script: string;
  packageManager: AppPreviewPackageManager;
  framework: string;
  command: readonly string[];
  commandLabel: string;
  score: number;
}>;

export type AppPreviewHtmlCandidate = Readonly<{
  path: string;
  label: string;
}>;

export type AppPreviewDetectionResult = Readonly<{
  projects: readonly AppPreviewProjectCandidate[];
  htmlFiles: readonly AppPreviewHtmlCandidate[];
}>;

export type AppPreviewSetup =
  | Readonly<{
      kind: "local-server";
      cwd: string;
      command: readonly string[];
      url?: string;
    }>
  | Readonly<{ kind: "static-file"; path: string }>
  | Readonly<{ kind: "existing-url"; url: string }>;

export type AppPreviewConfigureRequest = Readonly<{
  path: string;
  name: string;
  setup: AppPreviewSetup;
  expectedContent: string;
}>;

export type AppPreviewConfigureResult = Readonly<{
  content: string;
  version?: string | null;
}>;

export type AppPreviewResult = {
  runtimeId?: string | null;
  appId: string;
  name: string;
  status: AppPreviewStatus;
  path: string;
  url?: string | null;
  port?: number | null;
  command?: string[] | null;
  cwd?: string | null;
  message?: string | null;
  logs?: string | null;
  generation?: number;
  sequence?: number;
  reason?: "cancelled" | "preflight" | "process-exit" | "health-timeout" | "surface" | "unknown" | null;
  exitCode?: number | null;
};

export type AppPreviewBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AppPreviewSurfaceStatus = "loading" | "ready" | "error" | "destroyed";

export type AppPreviewSurfaceState = {
  surfaceId: string;
  runtimeId: string;
  appId: string;
  path: string;
  status: AppPreviewSurfaceStatus;
  url?: string | null;
  title?: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  attached: boolean;
  message?: string | null;
  generation?: number;
  sequence?: number;
};

export type AppPreviewActivationResult = {
  runtime: AppPreviewResult;
  surface: AppPreviewSurfaceState | null;
};

export type AppPreviewSurfaceCommand = "back" | "forward" | "reload";

export type AppPreviewAttachmentRequest = {
  path: string;
  bounds: AppPreviewBounds;
  attachmentId: string;
};

export type AppPreviewController = {
  detect?: (path: string) => Promise<AppPreviewDetectionResult>;
  configure?: (request: AppPreviewConfigureRequest) => Promise<AppPreviewConfigureResult>;
  start: (path: string) => Promise<AppPreviewResult>;
  activate?: (request: AppPreviewAttachmentRequest) => Promise<AppPreviewActivationResult>;
  restart?: (
    path: string,
    attachment?: Pick<AppPreviewAttachmentRequest, "bounds" | "attachmentId">,
  ) => Promise<AppPreviewResult | AppPreviewActivationResult>;
  stop?: (path: string) => Promise<AppPreviewResult>;
  getLogs?: (path: string) => Promise<string>;
  openExternal?: (path: string) => Promise<void>;
  setSurfaceBounds?: (request: {
    surfaceId: string;
    attachmentId: string;
    bounds: AppPreviewBounds;
  }) => Promise<{ ok: boolean; visible: boolean }>;
  detachSurface?: (request: {
    surfaceId?: string | null;
    attachmentId: string;
  }) => Promise<{ ok: boolean }>;
  runSurfaceCommand?: (request: {
    surfaceId: string;
    command: AppPreviewSurfaceCommand;
  }) => Promise<{ ok: boolean }>;
  subscribeRuntime?: (listener: (state: AppPreviewResult) => void) => () => void;
  subscribeSurface?: (listener: (state: AppPreviewSurfaceState) => void) => () => void;
};

export type OfficeDocumentConversionResult = {
  arrayBuffer: ArrayBuffer;
  warnings?: string[];
};

export type OfficeDocumentConversionOptions = {
  signal?: AbortSignal;
};

export type OfficeDocumentConverter = (
  path: string,
  options?: OfficeDocumentConversionOptions,
) => Promise<OfficeDocumentConversionResult>;

export type DataImportResult = {
  paths: string[];
};

export type DataCopyOptions = {
  preferredName?: string;
  forceDuplicateName?: boolean;
};

export type DataCopyResult = {
  path: string;
};

export type DataFileUrlPurpose = "file-preview" | "markdown-asset";

export type DataFileUrlOptions = {
  purpose?: DataFileUrlPurpose;
};

export type DataReadOptions = {
  signal?: AbortSignal;
};

export type DocumentPersistenceKind = "local-fs" | "cloud";

export type DocumentPersistenceReason =
  | "edit"
  | "manual"
  | "document-close"
  | "document-switch"
  | "workspace-switch"
  | "app-close"
  | "destroy";

export type DocumentPersistenceRequest = {
  path: string;
  content: string;
  revision: string;
  baseVersion?: string | null;
  reason: DocumentPersistenceReason;
};

export type DocumentPersistenceResult = {
  version?: string | null;
};

/**
 * Host-owned storage strategy. Editors never receive this port directly;
 * Document Sessions serialize and version every call.
 */
export type DocumentPersistencePort = {
  kind: DocumentPersistenceKind;
  persist: (request: DocumentPersistenceRequest) => Promise<DocumentPersistenceResult | void>;
};

export type DataCapabilities = {
  create?: boolean;
  rename?: boolean;
  delete?: boolean;
  move?: boolean;
  copy?: boolean;
  write?: boolean;
  history?: boolean;
  accessPoints?: boolean;
  cloudSync?: boolean;
  localGit?: boolean;
  connectors?: boolean;
};

export type DataPort = {
  listChildren: (folderPath: string | null) => Promise<DataNode[]>;
  readFile?: (path: string, options?: DataReadOptions) => Promise<FileContent>;
  getFileUrl?: (path: string, options?: DataFileUrlOptions) => string | Promise<string>;
  revokeFileUrl?: (url: string) => void | Promise<void>;
  openExternalFile?: (path: string) => Promise<void>;
  convertOfficeDocumentToDocx?: OfficeDocumentConverter;
  appPreview?: AppPreviewController;
  documentPersistence?: DocumentPersistencePort;
  createFolder?: (path: string) => Promise<void>;
  createFile?: (path: string, content?: string) => Promise<void>;
  importFiles?: (files: File[], targetFolderPath: string | null) => Promise<DataImportResult>;
  renameNode?: (path: string, nextName: string) => Promise<void>;
  deleteNode?: (path: string) => Promise<void>;
  moveNode?: (from: string, to: string) => Promise<void>;
  copyNode?: (
    fromPath: string,
    targetFolderPath: string | null,
    options?: DataCopyOptions,
  ) => Promise<DataCopyResult>;
};

export const defaultDataCapabilities: DataCapabilities = {
  create: false,
  rename: false,
  delete: false,
  move: false,
  copy: false,
  write: false,
  history: false,
  accessPoints: false,
  cloudSync: false,
  localGit: false,
  connectors: false,
};
