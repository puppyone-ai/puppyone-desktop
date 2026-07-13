import {
  getFileSemanticKind,
  getPreferredMimeType,
  resolveFileFormat,
  type DataNode,
  type DataNodeKind,
  type DataPort,
  type FileContent,
  type Workspace,
} from "@puppyone/shared-ui";
import {
  cloudApiRequest,
  getDesktopCloudApiBaseUrl,
  listCloudDirectory,
  type DesktopCloudProject,
  type DesktopCloudSession,
  type DesktopCloudTreeEntry,
} from "./cloudApi";

type SessionHandler = (session: DesktopCloudSession | null) => void | Promise<void>;

type CloudCatResponse = {
  path: string;
  type: string;
  content?: unknown;
  content_text?: string | null;
  content_hash?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  head_commit_id?: string | null;
};

type CloudWriteResponse = {
  path: string;
  commit_id: string;
  merged?: boolean;
  conflicts?: string[];
};

type CloudInlineUrlResponse = {
  url: string;
  expires_at?: number;
};

type CloudNodeType = "json" | "markdown" | "file";

const CLOUD_WORKSPACE_ID_PREFIX = "cloud:";
const CLOUD_WORKSPACE_PATH_PREFIX = "cloud://";
const CLOUD_DOCUMENT_PERSISTENCE_POLICY = Object.freeze({
  idleDelayMs: 1000,
  maxDelayMs: 5000,
});

export function isCloudWorkspace(workspace: Workspace | null | undefined): boolean {
  return Boolean(
    workspace &&
    (workspace.id.startsWith(CLOUD_WORKSPACE_ID_PREFIX) || workspace.path.startsWith(CLOUD_WORKSPACE_PATH_PREFIX)),
  );
}

export function createCloudWorkspace(project: DesktopCloudProject): Workspace {
  return {
    id: `${CLOUD_WORKSPACE_ID_PREFIX}${project.id}`,
    name: project.name || "Untitled Project",
    path: `${CLOUD_WORKSPACE_PATH_PREFIX}${project.id}`,
    status: "protected",
    cloudState: "synced",
  };
}

export function getCloudProjectIdFromWorkspace(workspace: Workspace | null | undefined): string | null {
  if (!workspace) return null;
  if (workspace.id.startsWith(CLOUD_WORKSPACE_ID_PREFIX)) {
    const projectId = workspace.id.slice(CLOUD_WORKSPACE_ID_PREFIX.length).trim();
    return projectId || null;
  }
  if (workspace.path.startsWith(CLOUD_WORKSPACE_PATH_PREFIX)) {
    const projectId = workspace.path.slice(CLOUD_WORKSPACE_PATH_PREFIX.length).trim();
    return projectId || null;
  }
  return null;
}

export function createCloudDataPort({
  projectId,
  session,
  onSessionChange,
  apiBaseUrl,
}: {
  projectId: string;
  session: DesktopCloudSession;
  onSessionChange?: SessionHandler;
  apiBaseUrl?: string | null;
}): DataPort {
  return {
    listChildren: async (folderPath) => {
      const tree = await listCloudDirectory(
        session,
        projectId,
        normalizeCloudPath(folderPath),
        onSessionChange,
        apiBaseUrl,
      );
      return sortCloudNodes(tree.entries.map(toDataNode));
    },
    readFile: async (path) => readCloudFile({
      projectId,
      path,
      session,
      onSessionChange,
      apiBaseUrl,
    }),
    getFileUrl: async (path) => getCloudFileUrl({
      projectId,
      path,
      session,
      onSessionChange,
      apiBaseUrl,
    }),
    documentPersistence: {
      kind: "cloud",
      policy: CLOUD_DOCUMENT_PERSISTENCE_POLICY,
      persist: async ({ path, content, baseVersion }) => {
        const response = await writeCloudFile({
          projectId,
          path,
          content,
          baseCommitId: baseVersion ?? null,
          session,
          onSessionChange,
          apiBaseUrl,
        });
        return { version: response.commit_id };
      },
    },
    createFolder: async (path) => {
      await cloudApiRequest(
        `/content/${encodeURIComponent(projectId)}/mkdir`,
        session,
        onSessionChange,
        {
          method: "POST",
          body: JSON.stringify({ path: normalizeCloudPath(path) }),
        },
        apiBaseUrl,
      );
    },
    createFile: async (path, content = "") => {
      await writeCloudFile({
        projectId,
        path,
        content,
        session,
        onSessionChange,
        apiBaseUrl,
      });
    },
    renameNode: async (path, nextName) => {
      const oldPath = normalizeCloudPath(path);
      const newPath = joinCloudPath(getCloudParentPath(oldPath), nextName);
      await moveCloudPath({
        projectId,
        oldPath,
        newPath,
        session,
        onSessionChange,
        apiBaseUrl,
      });
    },
    deleteNode: async (path) => {
      await cloudApiRequest(
        `/content/${encodeURIComponent(projectId)}/rm`,
        session,
        onSessionChange,
        {
          method: "POST",
          body: JSON.stringify({ path: normalizeCloudPath(path) }),
        },
        apiBaseUrl,
      );
    },
    moveNode: async (from, to) => {
      await moveCloudPath({
        projectId,
        oldPath: from,
        newPath: to,
        session,
        onSessionChange,
        apiBaseUrl,
      });
    },
  };
}

async function readCloudFile({
  projectId,
  path,
  session,
  onSessionChange,
  apiBaseUrl,
}: {
  projectId: string;
  path: string;
  session: DesktopCloudSession;
  onSessionChange?: SessionHandler;
  apiBaseUrl?: string | null;
}): Promise<FileContent> {
  const normalizedPath = normalizeCloudPath(path);
  const fileName = basename(normalizedPath);
  const response = await cloudApiRequest<CloudCatResponse>(
    `/content/${encodeURIComponent(projectId)}/cat?path=${encodeURIComponent(normalizedPath)}`,
    session,
    onSessionChange,
    {},
    apiBaseUrl,
  );
  const mimeType = response.mime_type ?? getPreferredMimeType(fileName);
  return {
    path: normalizeCloudPath(response.path || normalizedPath),
    name: fileName,
    type: getCloudNodeKind({
      name: fileName,
      type: response.type,
      mimeType,
    }),
    content: cloudContentToEditorText(response),
    mimeType,
    size: typeof response.size_bytes === "number" ? formatFileSize(response.size_bytes) : null,
    version: response.head_commit_id ?? null,
  };
}

async function getCloudFileUrl({
  projectId,
  path,
  session,
  onSessionChange,
  apiBaseUrl,
}: {
  projectId: string;
  path: string;
  session: DesktopCloudSession;
  onSessionChange?: SessionHandler;
  apiBaseUrl?: string | null;
}): Promise<string> {
  const response = await cloudApiRequest<CloudInlineUrlResponse>(
    `/content/${encodeURIComponent(projectId)}/inline/sign`,
    session,
    onSessionChange,
    {
      method: "POST",
      body: JSON.stringify({ path: normalizeCloudPath(path) }),
    },
    apiBaseUrl,
  );
  if (!response.url) throw new Error("Cloud preview URL is unavailable.");
  if (/^https?:\/\//i.test(response.url)) return response.url;
  const base = apiBaseUrl || session.api_base_url || getDesktopCloudApiBaseUrl();
  return new URL(response.url, base).toString();
}

async function writeCloudFile({
  projectId,
  path,
  content,
  baseCommitId = null,
  session,
  onSessionChange,
  apiBaseUrl,
}: {
  projectId: string;
  path: string;
  content: string;
  baseCommitId?: string | null;
  session: DesktopCloudSession;
  onSessionChange?: SessionHandler;
  apiBaseUrl?: string | null;
}): Promise<CloudWriteResponse> {
  const normalizedPath = normalizeCloudPath(path);
  const nodeType = getCloudWriteNodeType(normalizedPath);
  return cloudApiRequest<CloudWriteResponse>(
    `/content/${encodeURIComponent(projectId)}/write`,
    session,
    onSessionChange,
    {
      method: "POST",
      body: JSON.stringify({
        path: normalizedPath,
        content: getCloudWriteContent(content, nodeType),
        node_type: nodeType,
        ...(baseCommitId !== null ? { base_commit_id: baseCommitId } : {}),
      }),
    },
    apiBaseUrl,
  );
}

async function moveCloudPath({
  projectId,
  oldPath,
  newPath,
  session,
  onSessionChange,
  apiBaseUrl,
}: {
  projectId: string;
  oldPath: string;
  newPath: string;
  session: DesktopCloudSession;
  onSessionChange?: SessionHandler;
  apiBaseUrl?: string | null;
}): Promise<void> {
  await cloudApiRequest(
    `/content/${encodeURIComponent(projectId)}/mv`,
    session,
    onSessionChange,
    {
      method: "POST",
      body: JSON.stringify({
        old_path: normalizeCloudPath(oldPath),
        new_path: normalizeCloudPath(newPath),
      }),
    },
    apiBaseUrl,
  );
}

function toDataNode(entry: DesktopCloudTreeEntry): DataNode {
  const path = normalizeCloudPath(entry.path);
  const name = entry.name || basename(path);
  const type = getCloudNodeKind({
    name,
    type: entry.type,
    mimeType: entry.mime_type ?? null,
  });
  return {
    id: path,
    name,
    path,
    type,
    mimeType: entry.mime_type ?? getPreferredMimeType(name),
    size: typeof entry.size_bytes === "number" ? formatFileSize(entry.size_bytes) : null,
    modified: null,
    preview: null,
    content: null,
    hasChildren: type === "folder" ? entry.children_count !== 0 : false,
    children: null,
    source: "cloud",
  };
}

function getCloudNodeKind({
  name,
  type,
  mimeType,
}: {
  name: string;
  type?: string | null;
  mimeType?: string | null;
}): DataNodeKind {
  if (type === "folder") return "folder";
  if (type === "markdown") return "markdown";
  if (type === "json") return "json";
  return getFileSemanticKind(name, type, mimeType);
}

function getCloudWriteNodeType(path: string): CloudNodeType {
  const format = resolveFileFormat({ name: basename(path) });
  if (format.id === "json") return "json";
  if (format.id === "markdown") return "markdown";
  return "file";
}

function getCloudWriteContent(content: string, nodeType: CloudNodeType): unknown {
  if (nodeType !== "json") return content;
  if (!content.trim()) return null;
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("JSON files must contain valid JSON before saving.");
  }
}

function cloudContentToEditorText(response: CloudCatResponse): string | null {
  if (typeof response.content_text === "string") return response.content_text;
  if (response.content === null || response.content === undefined) return null;
  try {
    return JSON.stringify(response.content, null, 2);
  } catch {
    return String(response.content);
  }
}

function normalizeCloudPath(path: string | null | undefined): string {
  return (path ?? "").replace(/^\/+|\/+$/g, "");
}

function getCloudParentPath(path: string): string | null {
  const normalizedPath = normalizeCloudPath(path);
  if (!normalizedPath || !normalizedPath.includes("/")) return null;
  return normalizedPath.slice(0, normalizedPath.lastIndexOf("/"));
}

function joinCloudPath(parentPath: string | null, name: string): string {
  const normalizedParent = normalizeCloudPath(parentPath);
  const normalizedName = normalizeCloudPath(name);
  return normalizedParent ? `${normalizedParent}/${normalizedName}` : normalizedName;
}

function basename(path: string): string {
  const normalizedPath = normalizeCloudPath(path);
  if (!normalizedPath) return "";
  const parts = normalizedPath.split("/");
  return parts[parts.length - 1] ?? normalizedPath;
}

function sortCloudNodes(nodes: DataNode[]): DataNode[] {
  return [...nodes].sort((left, right) => {
    const leftFolder = left.type === "folder";
    const rightFolder = right.type === "folder";
    if (leftFolder !== rightFolder) return leftFolder ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function formatFileSize(bytes: number): string {
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  if (bytes >= gb) return `${(bytes / gb).toFixed(1)} GB`;
  if (bytes >= mb) return `${(bytes / mb).toFixed(1)} MB`;
  if (bytes >= kb) return `${(bytes / kb).toFixed(1)} KB`;
  return `${bytes} B`;
}
