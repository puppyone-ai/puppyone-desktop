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
  /** Main-owned cache hint from `.puppyone/config.json`; never grants filesystem authority. */
  cloudProjectId?: string | null;
  cloudBindingId?: string | null;
  cloudBindingOrigin?: string | null;
  cloudBindingWorkspaceInstanceId?: string | null;
  hasPuppyoneCloudRemote?: boolean;
  projectId?: string | null;
  workspaceInstanceId?: string;
  fsIdentity?: string;
  hydrationState?: "metadata" | "loading" | "ready" | "error";
  configError?: string;
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

export type AppPreviewResult = {
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
};

export type AppPreviewController = {
  start: (path: string) => Promise<AppPreviewResult>;
  restart?: (path: string) => Promise<AppPreviewResult>;
  stop?: (path: string) => Promise<AppPreviewResult>;
  getLogs?: (path: string) => Promise<string>;
  openExternal?: (path: string) => Promise<void>;
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
  | "idle"
  | "max-delay"
  | "manual"
  | "mode-switch"
  | "document-switch"
  | "app-close"
  | "destroy";

export type DocumentPersistencePolicy = {
  idleDelayMs: number;
  maxDelayMs: number;
};

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
  policy: DocumentPersistencePolicy;
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
