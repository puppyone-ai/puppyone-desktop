import {
  CLOUD_API_BASE_URL_STORAGE_KEY,
  buildCloudApiUrl as buildCanonicalCloudApiUrl,
  cloudApiBaseUrlFromRemote,
  formatCloudApiHost as formatCanonicalCloudApiHost,
  normalizeCloudApiBaseUrl,
  resolveCloudApiBaseUrl,
  sameCloudApiBaseUrl,
} from "../../shared/cloudEndpoint.js";
import { invalidateCloudCacheForMutation } from "../features/cloud/cache/cloudCache";
import { createCloudAutomationApi } from "./cloud/automationApi";

type ApiEnvelope<T> = {
  code?: number;
  message?: string;
  data?: T;
  detail?: unknown;
  error?: string;
};

export type MutableSessionHandler = (session: DesktopCloudSession | null) => void | Promise<void>;

export type DesktopCloudSession = {
  expires_in: number;
  expires_at: number;
  user_id: string;
  user_email: string;
  api_base_url: string;
  session_generation: string;
  status:
    | "restoring"
    | "signing-in"
    | "authenticated"
    | "refreshing"
    | "offline-authenticated"
    | "signing-out"
    | "expired"
    | "signed-out";
};

export type DesktopCloudProject = {
  id: string;
  name: string;
  description?: string | null;
  org_id?: string | null;
  visibility?: string | null;
  bound_git_branch?: string | null;
  updated_at?: string | null;
  access_point_count?: number | null;
  effective_role?: "admin" | "editor" | "viewer";
  grant_source?: "org_owner" | "project_member" | "org_visibility";
  capabilities?: string[];
};

export type DesktopCloudTemplateRegistryStatus = {
  mode: "disabled" | "builtin" | "remote";
  catalog_enabled: boolean;
  instantiation_enabled: boolean;
  source: "disabled" | "builtin" | "remote";
  reason?: string | null;
};

export type DesktopCloudTemplateRelease = {
  id: string;
  version: string;
  bundle_sha256: string;
  file_count: number;
  total_bytes: number;
  published_at?: string | null;
  signing_key_id?: string | null;
};

export type DesktopCloudTemplatePreviewNode = {
  name: string;
  type: "folder" | "json" | "markdown" | "file";
};

export type DesktopCloudTemplateSummary = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category?: string | null;
  cover_url?: string | null;
  author?: string | null;
  tags: string[];
  preview: DesktopCloudTemplatePreviewNode[];
  current_release: DesktopCloudTemplateRelease;
};

export type DesktopCloudTemplateDetail = DesktopCloudTemplateSummary & {
  screenshots: string[];
  long_description?: string | null;
  file_tree: string[];
  preview_document?: { path: string; content: string } | null;
  releases: DesktopCloudTemplateRelease[];
};

export type DesktopCloudTemplateCatalog = {
  registry: DesktopCloudTemplateRegistryStatus;
  templates: DesktopCloudTemplateSummary[];
  next_cursor?: string | null;
};

export type DesktopCloudTemplateInstantiation = {
  template_id: string;
  release_id: string;
  project: DesktopCloudProject;
};

export type DesktopCloudProjectReadiness = {
  project_id: string;
  git: {
    root_scope_id: string | null;
    root_surface_exists: boolean;
    root_head_exists: boolean;
    root_git_push_accepted: boolean;
    default_branch: string;
    state: "git_not_created" | "awaiting_first_push" | "ready";
  };
  claude: {
    ready: boolean;
    blockers: Array<
      | "root_git_surface_missing"
      | "root_head_missing"
      | "root_git_push_not_accepted"
      | string
    >;
  };
};

export type DesktopCloudWorkspaceBinding = {
  id: string;
  org_id: string;
  project_id: string;
  scope_id: string;
  scope_path?: string | null;
  workspace_instance_id: string;
  bound_user_id: string;
  cloud_origin: string;
  binding_kind: "full" | "scoped";
  mode: "r" | "rw";
  status: "active" | "revoked";
  usable: boolean;
  unusable_reason?: "binding_revoked" | "wrong_account" | "role_downgraded" | string | null;
  /** Current human Project grant, returned by context-capable binding APIs. */
  capabilities?: string[] | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  revoked_at?: string | null;
  /** Returned exactly once by create; never persist this field locally. */
  credential?: string | null;
  remote: {
    url: string;
    project_id: string;
    scope_id: string;
    kind: "full" | "scoped";
    username: string;
  };
};

export type DesktopCloudWorkspaceBindingCreate = {
  workspace_instance_id: string;
  cloud_origin: string;
  binding_kind: "full" | "scoped";
  scope_id?: string | null;
  mode: "r" | "rw";
};

export type DesktopCloudLegacyBindingCandidate = {
  project_id: string;
  scope_id: string;
  binding_kind: "full" | "scoped";
  requires_confirmation: true;
};

export type DesktopCloudCanonicalProjectContext = {
  project: DesktopCloudProject & {
    org_id: string;
    visibility: string;
    bound_git_branch: string;
    effective_role: "admin" | "editor" | "viewer";
    grant_source: "org_owner" | "project_member" | "org_visibility";
    capabilities: string[];
  };
  scope: {
    id: string;
    kind: "full" | "scoped";
    path: string | null;
  };
  locator: {
    project_id: string;
    scope_id: string;
    binding_kind: "full" | "scoped";
  };
};

export type DesktopCloudOrganization = {
  id: string;
  name: string;
  slug: string;
  avatar_url?: string | null;
  plan: string;
  seat_limit: number;
  created_at: string;
  member_count?: number | null;
};

export type DesktopCloudOrgMember = {
  id: string;
  user_id: string;
  email?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  role: "owner" | "member" | "viewer" | string;
  joined_at: string;
};

export type DesktopCloudOrganizationEntitlements = {
  org_id: string;
  plan_id: string;
  status: string;
  source: string;
  entitlements: {
    features?: Record<string, boolean>;
    limits?: Record<string, number | string | null>;
    allow?: Record<string, string[] | string | null>;
  };
  current_period_end?: string | null;
  effective_until?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DesktopCloudDashboard = {
  project: {
    id: string;
    name: string;
    description?: string | null;
  };
  nodes: {
    total: number;
    folders: number;
    files: number;
  };
  connections: DesktopCloudDashboardConnection[];
  tools: Array<{
    id: string;
    name: string;
    type?: string | null;
    index_status?: string | null;
    chunks_count?: number | null;
    total_files?: number | null;
    indexed_files?: number | null;
  }>;
  uploads: Array<{
    id: string;
    status: string;
    type: string;
    progress?: number;
    message?: string | null;
  }>;
};

export type DesktopCloudDashboardConnection = {
  id: string;
  provider: string;
  name?: string | null;
  path?: string | null;
  direction?: string | null;
  status: string;
  access_key?: string | null;
  trigger?: Record<string, unknown> | null;
  last_synced_at?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  usage_buckets?: number[];
};

export type DesktopCloudTreeEntry = {
  name: string;
  path: string;
  type: string;
  content_hash?: string | null;
  size_bytes?: number | null;
  mime_type?: string | null;
  children_count?: number | null;
  integrity_status?: "ok" | "damaged" | "unknown";
};

export type DesktopCloudTree = {
  path: string;
  entries: DesktopCloudTreeEntry[];
  head_commit_id?: string;
};

export type DesktopCloudAccessPointSemantics = {
  project_id?: string | null;
  scope?: {
    id?: string | null;
    project_id?: string | null;
    repo_id?: string | null;
    repo_kind?: string | null;
    repo_ref?: string | null;
    path?: string | null;
    mode?: string | null;
    exclude?: string[] | null;
  } | null;
};

export type DesktopCloudScope = {
  id: string;
  project_id: string;
  name: string;
  path: string;
  exclude: string[];
  mode: "r" | "rw";
  is_root: boolean;
  access_key?: string | null;
  access_key_revoked?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DesktopCloudScopePatch = {
  name?: string;
  exclude?: string[];
  mode?: "r" | "rw";
};

export type DesktopCloudCreateScopeRequest = {
  name: string;
  path: string;
  exclude?: string[];
  mode?: "r" | "rw";
};

export type DesktopCloudConnector = {
  id: string;
  project_id: string;
  scope_id: string;
  provider: string;
  name: string;
  direction: string;
  config?: Record<string, unknown>;
  oauth_connection_id?: number | null;
  trigger?: Record<string, unknown>;
  status: string;
  access_key?: string | null;
  last_run_at?: string | null;
  last_run_id?: string | null;
  error_message?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DesktopCloudConnectorPatch = {
  name?: string;
  direction?: string;
  config?: Record<string, unknown>;
  policy?: unknown;
  oauth_connection_id?: number | null;
  trigger?: Record<string, unknown> | null;
  status?: string;
};

export type DesktopCloudAutomationConfigField = {
  key: string;
  label: string;
  type: "text" | "select" | "number" | "url";
  required: boolean;
  default: string | number | null;
  options: { value: string; label: string }[] | null;
  placeholder: string | null;
  hint: string | null;
};

export type DesktopCloudAutomationProviderSpec = {
  provider: string;
  display_name: string;
  description: string | null;
  auth: "none" | "oauth" | "optional_oauth" | "api_key" | "access_key";
  creation_mode: "direct" | "bootstrap";
  category: "datasource" | "agent" | "endpoint";
  icon: string | null;
  oauth_type?: string | null;
  oauth_ui_type?: string | null;
  default_sync_mode?: string;
  supported_sync_modes?: string[];
  supported_directions?: string[];
  config_fields?: DesktopCloudAutomationConfigField[];
  icon_url?: string | null;
};

export type DesktopCloudAutomationConnection = {
  id: string;
  project_id: string;
  path: string | null;
  direction: string;
  provider: string;
  config: Record<string, unknown>;
  status: string;
  last_sync_commit_id?: string | null;
  error_message?: string | null;
};

export type DesktopCloudCreateAutomationRequest = {
  project_id: string;
  provider: string;
  config: Record<string, unknown>;
  target_folder_path?: string;
  target_path?: string;
  direction?: string;
  conflict_strategy?: string;
  sync_mode?: "manual" | "scheduled" | "realtime";
  trigger?: { type: string; schedule?: string; timezone?: string };
};

export type DesktopCloudCreateAutomationResult = {
  /** Legacy server response key. Product/domain code calls this Automation. */
  sync: DesktopCloudAutomationConnection;
  execution_result?: Record<string, unknown> | null;
};

export type DesktopCloudAutomationOauthStatus = {
  connected: boolean;
  workspace_name: string | null;
  connected_at: string | null;
  connection_id: number | null;
};

export type DesktopCloudAutomationProviderResource = {
  id: string;
  type: string;
  name: string;
  url: string | null;
  subtitle: string | null;
  icon: string | null;
  authorized: boolean;
  metadata: Record<string, unknown>;
};

export type DesktopCloudAutomationProviderResources = {
  resources: DesktopCloudAutomationProviderResource[];
  next_cursor: string | null;
};

export type DesktopCloudUpdateAutomationConnectionRequest = {
  config?: Record<string, unknown>;
  target_path?: string;
  direction?: string;
  conflict_strategy?: string;
};

export type DesktopCloudUpdateAutomationTriggerRequest = {
  sync_mode: "manual" | "scheduled" | "realtime";
  trigger?: { type: string; schedule?: string; timezone?: string } | null;
};

export type DesktopCloudAutomationRun = {
  id: string;
  access_point_id: string;
  status: string;
  worker_job_id?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  exit_code?: number | null;
  stdout?: string | null;
  error?: string | null;
  trigger_type?: string | null;
  result_summary?: string | null;
};

export type DesktopCloudMcpEndpoint = {
  id: string;
  project_id: string;
  path: string | null;
  name: string;
  description?: string | null;
  api_key?: string;
  api_key_hint?: string;
  api_key_revealed?: boolean;
  status: string;
  accesses?: Array<{ path: string; json_path?: string; readonly?: boolean }>;
  config?: Record<string, unknown>;
  tools_config?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DesktopCloudCreateMcpEndpointRequest = {
  project_id: string;
  name?: string;
  path?: string;
  description?: string;
  accesses?: Array<{ path: string; json_path?: string; readonly?: boolean }>;
  tools_config?: unknown;
};

export type DesktopCloudUpdateMcpEndpointRequest = {
  name?: string;
  description?: string;
  path?: string;
  status?: string;
  accesses?: Array<{ path: string; json_path?: string; readonly?: boolean }>;
  tools_config?: unknown;
};

export type DesktopCloudRepoIdentity = {
  project_id: string;
  url: string;
  prompt_template?: string;
  content_initialized?: boolean;
  head_commit_id?: string | null;
  scopes: Array<{
    id: string;
    name: string;
    path: string;
    is_root: boolean;
    git_url?: string;
    access_key?: string | null;
  }>;
};

function normalizeSessionApiBase(apiBaseUrl: string | null | undefined): string {
  if (typeof apiBaseUrl === "string" && apiBaseUrl.trim()) {
    return resolveCloudApiBaseUrl(apiBaseUrl);
  }
  return getDesktopCloudApiBaseUrl();
}

export function getDesktopCloudApiBaseUrl(): string {
  try {
    const stored = window.localStorage.getItem(CLOUD_API_BASE_URL_STORAGE_KEY)?.trim();
    if (stored) {
      const normalized = normalizeCloudApiBaseUrl(stored);
      if (normalized) {
        if (normalized !== stored.replace(/\/+$/, "")) {
          window.localStorage.setItem(CLOUD_API_BASE_URL_STORAGE_KEY, normalized);
        }
        return normalized;
      }
      window.localStorage.removeItem(CLOUD_API_BASE_URL_STORAGE_KEY);
    }
  } catch {
    // Fall through to env/default.
  }

  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const configured = env?.VITE_DESKTOP_CLOUD_API_URL || env?.VITE_CLOUD_API_URL || env?.VITE_API_URL;
  const normalized = normalizeCloudApiBaseUrl(configured);
  if (!normalized) {
    throw new Error("VITE_DESKTOP_CLOUD_API_URL must configure the Cloud API endpoint.");
  }
  return normalized;
}

export function desktopCloudApiUrl(path: string): string {
  return buildCanonicalCloudApiUrl(path);
}

export function desktopCloudApiBaseUrlFromRemote(remoteUrl: string | null): string | null {
  return cloudApiBaseUrlFromRemote(remoteUrl);
}

export function isCloudSessionForApiBase(
  session: DesktopCloudSession | null | undefined,
  apiBaseUrl?: string | null,
): boolean {
  if (!session) return false;
  return sameCloudApiBaseUrl(session.api_base_url, apiBaseUrl);
}

export function getDesktopCloudWebUrl(path: string): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const configured = env?.VITE_DESKTOP_CLOUD_WEB_URL?.trim();
  if (!configured) {
    throw new Error("VITE_DESKTOP_CLOUD_WEB_URL must configure the Cloud web endpoint.");
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(configured);
  } catch {
    throw new Error("VITE_DESKTOP_CLOUD_WEB_URL is invalid.");
  }
  if (
    !["http:", "https:"].includes(baseUrl.protocol)
    || !baseUrl.hostname
    || baseUrl.username
    || baseUrl.password
  ) {
    throw new Error("VITE_DESKTOP_CLOUD_WEB_URL is invalid.");
  }

  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, `${baseUrl.toString().replace(/\/+$/, "")}/`).toString();
}

export function openCloudApp(path: string): void {
  window.open(getDesktopCloudWebUrl(path), "_blank", "noopener,noreferrer");
}

export async function cloudApiRequest<T>(
  path: string,
  session: DesktopCloudSession,
  onSessionChange?: MutableSessionHandler,
  init: RequestInit = {},
  apiBaseUrl?: string | null,
): Promise<T> {
  const requestedApiBase = normalizeSessionApiBase(apiBaseUrl);
  const sessionApiBase = normalizeSessionApiBase(session.api_base_url);
  if (sessionApiBase !== requestedApiBase) {
    const error = new Error(`Sign in to ${formatCloudApiHost(requestedApiBase)} to load this Cloud workspace.`);
    (error as Error & { status?: number }).status = 401;
    throw error;
  }

  if (window.puppyoneDesktop?.requestCloudSessionApi) {
    const body = typeof init.body === "string" ? init.body : undefined;
    try {
      const result = await window.puppyoneDesktop.requestCloudSessionApi({
        apiBaseUrl: requestedApiBase,
        path: path.startsWith("/") ? path : `/${path}`,
        method: init.method ?? "GET",
        headers: normalizeRequestHeaders(init.headers),
        ...(body === undefined ? {} : { body }),
      }) as T;
      if (isMutationMethod(init.method)) {
        invalidateCloudCacheForMutation({ session, apiPath: path });
      }
      return result;
    } catch (error) {
      const normalized = normalizeCloudBridgeError(error);
      throw normalized;
    }
  }

  const error = new Error("Desktop secure Cloud session service is unavailable.");
  (error as Error & { status?: number }).status = 401;
  throw error;
}

function isMutationMethod(method: string | undefined) {
  const normalized = (method ?? "GET").toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD" && normalized !== "OPTIONS";
}

export function listCloudProjects(
  session: DesktopCloudSession,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudProject[]> {
  return cloudApiRequest<DesktopCloudProject[]>("/projects/", session, onSessionChange, {}, apiBaseUrl);
}

export function getCloudProject(
  session: DesktopCloudSession,
  projectId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudProject> {
  return cloudApiRequest<DesktopCloudProject>(
    `/projects/${encodeURIComponent(projectId)}`,
    session,
    onSessionChange,
    {},
    apiBaseUrl,
  );
}

export function getCloudProjectReadiness(
  session: DesktopCloudSession,
  projectId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudProjectReadiness> {
  return cloudApiRequest<DesktopCloudProjectReadiness>(
    `/projects/${encodeURIComponent(projectId)}/readiness`,
    session,
    onSessionChange,
    {},
    apiBaseUrl,
  );
}

export function createCloudWorkspaceBinding(
  session: DesktopCloudSession,
  projectId: string,
  payload: DesktopCloudWorkspaceBindingCreate,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudWorkspaceBinding> {
  return cloudApiRequest<DesktopCloudWorkspaceBinding>(
    `/projects/${encodeURIComponent(projectId)}/workspace-bindings`,
    session,
    onSessionChange,
    { method: "POST", body: JSON.stringify(payload) },
    apiBaseUrl,
  );
}

export function getCloudWorkspaceBinding(
  session: DesktopCloudSession,
  bindingId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudWorkspaceBinding> {
  return cloudApiRequest<DesktopCloudWorkspaceBinding>(
    `/workspace-bindings/${encodeURIComponent(bindingId)}`,
    session,
    onSessionChange,
    {},
    apiBaseUrl,
  );
}

export function heartbeatCloudWorkspaceBinding(
  session: DesktopCloudSession,
  bindingId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudWorkspaceBinding> {
  return cloudApiRequest<DesktopCloudWorkspaceBinding>(
    `/workspace-bindings/${encodeURIComponent(bindingId)}/heartbeat`,
    session,
    onSessionChange,
    { method: "POST" },
    apiBaseUrl,
  );
}

export function revokeCloudWorkspaceBinding(
  session: DesktopCloudSession,
  bindingId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<void> {
  return cloudApiRequest<void>(
    `/workspace-bindings/${encodeURIComponent(bindingId)}`,
    session,
    onSessionChange,
    { method: "DELETE" },
    apiBaseUrl,
  );
}

export async function rotateCloudWorkspaceBindingCredential(
  session: DesktopCloudSession,
  bindingId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<string> {
  const result = await cloudApiRequest<{
    binding_id: string;
    credential: string;
    remote: DesktopCloudWorkspaceBinding["remote"];
  }>(
    `/workspace-bindings/${encodeURIComponent(bindingId)}/credential/rotate`,
    session,
    onSessionChange,
    { method: "POST" },
    apiBaseUrl,
  );
  return result.credential;
}

export function revokeCloudWorkspaceBindingCredential(
  session: DesktopCloudSession,
  bindingId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<void> {
  return cloudApiRequest<void>(
    `/workspace-bindings/${encodeURIComponent(bindingId)}/credential/revoke`,
    session,
    onSessionChange,
    { method: "POST" },
    apiBaseUrl,
  );
}

export function resolveLegacyCloudWorkspaceRemote(
  session: DesktopCloudSession,
  remoteUrl: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudLegacyBindingCandidate> {
  return cloudApiRequest<DesktopCloudLegacyBindingCandidate>(
    "/desktop/project-bindings/resolve-legacy-remote",
    session,
    onSessionChange,
    { method: "POST", body: JSON.stringify({ remote_url: remoteUrl }) },
    apiBaseUrl,
  );
}

export function resolveCanonicalCloudWorkspaceRemote(
  session: DesktopCloudSession,
  remoteUrl: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudCanonicalProjectContext> {
  return cloudApiRequest<DesktopCloudCanonicalProjectContext>(
    "/desktop/project-bindings/resolve-canonical-remote",
    session,
    onSessionChange,
    { method: "POST", body: JSON.stringify({ remote_url: remoteUrl }) },
    apiBaseUrl,
  );
}

export function projectAllows(
  project: DesktopCloudProject | null | undefined,
  capability: string,
): boolean {
  return project?.capabilities?.includes(capability) === true;
}

export function listCloudOrganizations(
  session: DesktopCloudSession,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudOrganization[]> {
  return cloudApiRequest<DesktopCloudOrganization[]>("/organizations/", session, onSessionChange, {}, apiBaseUrl);
}

export function listCloudOrganizationMembers(
  session: DesktopCloudSession,
  orgId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudOrgMember[]> {
  return cloudApiRequest<DesktopCloudOrgMember[]>(`/organizations/${orgId}/members`, session, onSessionChange, {}, apiBaseUrl);
}

export function getCloudOrganizationEntitlements(
  session: DesktopCloudSession,
  orgId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudOrganizationEntitlements> {
  return cloudApiRequest<DesktopCloudOrganizationEntitlements>(`/organizations/${orgId}/entitlements`, session, onSessionChange, {}, apiBaseUrl);
}

export function createCloudProject(
  session: DesktopCloudSession,
  name: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudProject> {
  return cloudApiRequest<DesktopCloudProject>("/projects/", session, onSessionChange, {
    method: "POST",
    body: JSON.stringify({ name, seed: false }),
  }, apiBaseUrl);
}

export function listCloudTemplates(
  session: DesktopCloudSession,
  options: {
    query?: string;
    category?: string;
    cursor?: string;
    limit?: number;
  } = {},
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudTemplateCatalog> {
  const query = new URLSearchParams();
  if (options.query) query.set("q", options.query);
  if (options.category) query.set("category", options.category);
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.limit) query.set("limit", String(options.limit));
  const suffix = query.size ? `?${query.toString()}` : "";
  return cloudApiRequest<DesktopCloudTemplateCatalog>(
    `/templates${suffix}`,
    session,
    onSessionChange,
    {},
    apiBaseUrl,
  );
}

export function getCloudTemplate(
  session: DesktopCloudSession,
  templateId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudTemplateDetail> {
  return cloudApiRequest<DesktopCloudTemplateDetail>(
    `/templates/${encodeURIComponent(templateId)}`,
    session,
    onSessionChange,
    {},
    apiBaseUrl,
  );
}

export function instantiateCloudTemplate(
  session: DesktopCloudSession,
  templateId: string,
  payload: {
    org_id?: string;
    name?: string;
    description?: string;
    release_id?: string;
  } = {},
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudTemplateInstantiation> {
  return cloudApiRequest<DesktopCloudTemplateInstantiation>(
    `/templates/${encodeURIComponent(templateId)}/instantiate`,
    session,
    onSessionChange,
    { method: "POST", body: JSON.stringify(payload) },
    apiBaseUrl,
  );
}

export function getCloudDashboard(
  session: DesktopCloudSession,
  projectId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudDashboard> {
  return cloudApiRequest<DesktopCloudDashboard>(`/projects/${projectId}/dashboard`, session, onSessionChange, {}, apiBaseUrl);
}

export function listCloudRoot(
  session: DesktopCloudSession,
  projectId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudTree> {
  return listCloudDirectory(session, projectId, "", onSessionChange, apiBaseUrl);
}

export function listCloudDirectory(
  session: DesktopCloudSession,
  projectId: string,
  path = "",
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudTree> {
  return cloudApiRequest<DesktopCloudTree>(
    `/content/${projectId}/ls?path=${encodeURIComponent(path.replace(/^\/+/, ""))}`,
    session,
    onSessionChange,
    {},
    apiBaseUrl,
  );
}

export function listCloudAccessPointDirectory(
  accessKey: string,
  path = "",
  userEmail?: string | null,
  remoteUrl?: string | null,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudTree> {
  const normalizedPath = path.replace(/^\/+/, "");
  if (window.puppyoneDesktop?.listCloudAccessPointDirectory) {
    return window.puppyoneDesktop.listCloudAccessPointDirectory({
      accessKey,
      path: normalizedPath,
      userEmail: userEmail ?? null,
      remoteUrl: remoteUrl ?? null,
      apiBaseUrl: apiBaseUrl ?? getDesktopCloudApiBaseUrl(),
    });
  }

  const headers: Record<string, string> = {
    "X-Access-Key": accessKey,
    "X-Puppy-Client": "cli",
  };
  if (userEmail) headers["X-PuppyOne-User"] = userEmail;

  const query = new URLSearchParams({
    path: normalizedPath,
    include_hidden: "true",
    include_size: "true",
  });

  return requestPublic<DesktopCloudTree>(
    `/ap-fs/ls?${query.toString()}`,
    {
      method: "GET",
      headers,
    },
    desktopCloudApiBaseUrlFromRemote(remoteUrl ?? null) ?? apiBaseUrl,
  );
}

export function getCloudAccessPointSemantics(
  accessKey: string,
  userEmail?: string | null,
  remoteUrl?: string | null,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudAccessPointSemantics> {
  if (window.puppyoneDesktop?.getCloudAccessPointSemantics) {
    return window.puppyoneDesktop.getCloudAccessPointSemantics({
      accessKey,
      userEmail: userEmail ?? null,
      remoteUrl: remoteUrl ?? null,
      apiBaseUrl: apiBaseUrl ?? getDesktopCloudApiBaseUrl(),
    });
  }

  const headers: Record<string, string> = {
    "X-Access-Key": accessKey,
    "X-Puppy-Client": "cli",
  };
  if (userEmail) headers["X-PuppyOne-User"] = userEmail;

  return requestPublic<DesktopCloudAccessPointSemantics>(
    "/ap-fs/semantics",
    {
      method: "GET",
      headers,
    },
    desktopCloudApiBaseUrlFromRemote(remoteUrl ?? null) ?? apiBaseUrl,
  );
}

export function listCloudScopes(
  session: DesktopCloudSession,
  projectId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudScope[]> {
  return cloudApiRequest<DesktopCloudScope[]>(`/projects/${projectId}/scopes`, session, onSessionChange, {}, apiBaseUrl);
}

export function createCloudScope(
  session: DesktopCloudSession,
  projectId: string,
  body: DesktopCloudCreateScopeRequest,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudScope> {
  return cloudApiRequest<DesktopCloudScope>(
    `/projects/${encodeURIComponent(projectId)}/scopes`,
    session,
    onSessionChange,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    apiBaseUrl,
  );
}

export function listCloudConnectors(
  session: DesktopCloudSession,
  projectId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudConnector[]> {
  return cloudApiRequest<DesktopCloudConnector[]>(`/projects/${projectId}/connectors`, session, onSessionChange, {}, apiBaseUrl);
}

export function updateCloudConnector(
  session: DesktopCloudSession,
  projectId: string,
  connectorId: string,
  body: DesktopCloudConnectorPatch,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudConnector> {
  return cloudApiRequest<DesktopCloudConnector>(
    `/projects/${encodeURIComponent(projectId)}/connectors/${encodeURIComponent(connectorId)}`,
    session,
    onSessionChange,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    apiBaseUrl,
  );
}

export const {
  supportsCloudAutomationOauth,
  getCloudAutomationOauthStatus,
  getCloudAutomationOauthAuthorizeUrl,
  openCloudAutomationAuthorizationUrl,
  listCloudAutomationProviderResources,
  listCloudAutomationProviderSpecs,
  createCloudAutomation,
  updateCloudAutomationConnection,
  updateCloudAutomationTrigger,
  listCloudAutomationConnectionRuns,
  getCloudAutomationRun,
  refreshCloudAutomationConnection,
  pauseCloudAutomationConnection,
  resumeCloudAutomationConnection,
  deleteCloudAutomationConnection,
} = createCloudAutomationApi(cloudApiRequest);

export function listCloudMcpEndpoints(
  session: DesktopCloudSession,
  projectId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudMcpEndpoint[]> {
  return cloudApiRequest<DesktopCloudMcpEndpoint[]>(
    `/mcp-endpoints?project_id=${encodeURIComponent(projectId)}`,
    session,
    onSessionChange,
    {},
    apiBaseUrl,
  );
}

export function createCloudMcpEndpoint(
  session: DesktopCloudSession,
  body: DesktopCloudCreateMcpEndpointRequest,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudMcpEndpoint> {
  return cloudApiRequest<DesktopCloudMcpEndpoint>(
    "/mcp-endpoints",
    session,
    onSessionChange,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    apiBaseUrl,
  );
}

export function updateCloudMcpEndpoint(
  session: DesktopCloudSession,
  endpointId: string,
  body: DesktopCloudUpdateMcpEndpointRequest,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudMcpEndpoint> {
  return cloudApiRequest<DesktopCloudMcpEndpoint>(
    `/mcp-endpoints/${encodeURIComponent(endpointId)}`,
    session,
    onSessionChange,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
    apiBaseUrl,
  );
}

export function getCloudRepoIdentity(
  session: DesktopCloudSession,
  projectId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudRepoIdentity> {
  return cloudApiRequest<DesktopCloudRepoIdentity>(`/projects/${projectId}/access-point`, session, onSessionChange, {}, apiBaseUrl);
}

export function updateCloudScope(
  session: DesktopCloudSession,
  projectId: string,
  scopeId: string,
  patch: DesktopCloudScopePatch,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudScope> {
  return cloudApiRequest<DesktopCloudScope>(
    `/projects/${projectId}/scopes/${scopeId}`,
    session,
    onSessionChange,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
    apiBaseUrl,
  );
}

export function regenerateCloudScopeKey(
  session: DesktopCloudSession,
  projectId: string,
  scopeId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudScope> {
  return cloudApiRequest<DesktopCloudScope>(
    `/projects/${projectId}/scopes/${scopeId}/regenerate-key`,
    session,
    onSessionChange,
    { method: "POST", body: JSON.stringify({}) },
    apiBaseUrl,
  );
}

export function deleteCloudScope(
  session: DesktopCloudSession,
  projectId: string,
  scopeId: string,
  onSessionChange?: MutableSessionHandler,
  apiBaseUrl?: string | null,
): Promise<void> {
  return cloudApiRequest<void>(
    `/projects/${projectId}/scopes/${scopeId}`,
    session,
    onSessionChange,
    { method: "DELETE" },
    apiBaseUrl,
  );
}

async function requestPublic<T>(path: string, init: RequestInit, apiBaseUrl?: string | null): Promise<T> {
  return requestRaw<T>(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  }, apiBaseUrl);
}

function normalizeRequestHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, value]));
  }
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
}

async function requestRaw<T = unknown>(path: string, init: RequestInit, apiBaseUrl?: string | null): Promise<T> {
  const normalizedApiBaseUrl = resolveCloudApiBaseUrl(apiBaseUrl || getDesktopCloudApiBaseUrl());
  if (window.puppyoneDesktop?.requestCloudApi) {
    const body = typeof init.body === "string" ? init.body : undefined;
    try {
      return await window.puppyoneDesktop.requestCloudApi({
        apiBaseUrl: normalizedApiBaseUrl,
        path: path.startsWith("/") ? path : `/${path}`,
        method: init.method ?? "GET",
        headers: normalizeRequestHeaders(init.headers),
        ...(body === undefined ? {} : { body }),
      }) as T;
    } catch (error) {
      throw normalizeCloudBridgeError(error);
    }
  }

  const response = await fetch(buildCanonicalCloudApiUrl(path, apiBaseUrl), init);
  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(getCloudApiErrorMessage(payload, `Request failed (${response.status})`));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return (payload && "data" in payload ? payload.data : payload) as T;
}

function getCloudApiErrorMessage(payload: ApiEnvelope<unknown> | null, fallback: string): string {
  const detail = payload?.detail;
  if (typeof payload?.message === "string" && payload.message) return payload.message;
  if (typeof detail === "string" && detail) return detail;
  if (isRecord(detail) && typeof detail.message === "string" && detail.message) return detail.message;
  if (typeof payload?.error === "string" && payload.error) return payload.error;
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function normalizeCloudBridgeError(error: unknown): Error {
  const original = error instanceof Error ? error.message : String(error);
  const transportedMessage = original
    .replace(/^Error invoking remote method 'cloud:(?:api-request|session-api-request)':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
  const transportedStatus = transportedMessage.match(
    /^Request failed \(([1-5]\d\d)\):\s*/i,
  );
  const message = transportedMessage
    .replace(/^Request failed \([1-5]\d\d\):\s*/i, "")
    .trim();
  const normalized = new Error(message || "Cloud request failed.");
  const sourceStatus = isRecord(error) && typeof error.status === "number" ? error.status : undefined;
  const statusFromMessage = transportedStatus?.[1]
    ?? transportedMessage.match(/(?:request failed|status)\s*\(?([1-5]\d\d)\)?/i)?.[1];
  const status = sourceStatus ?? (statusFromMessage ? Number(statusFromMessage) : undefined);
  if (status) (normalized as Error & { status?: number }).status = status;
  if (/invalid or expired token|sign in again/i.test(message)) {
    (normalized as Error & { status?: number }).status = 401;
  }
  return normalized;
}

function formatCloudApiHost(apiBaseUrl: string) {
  return formatCanonicalCloudApiHost(apiBaseUrl);
}
