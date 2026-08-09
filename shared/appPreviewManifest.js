export const APP_PREVIEW_TYPE = "puppyone.app";
export const APP_PREVIEW_VERSION = 1;
export const APP_PREVIEW_EXTENSION = ".puppyoneapp";
export const APP_PREVIEW_TEMPLATE_VARIABLES = Object.freeze(["port"]);

const TOP_LEVEL_FIELDS = new Set(["id", "name", "type", "version", "launch", "permissions"]);
const LOCAL_SERVER_LAUNCH_FIELDS = new Set(["kind", "command", "cwd", "env", "url", "health"]);
const STATIC_FILE_LAUNCH_FIELDS = new Set(["kind", "path"]);
const EXISTING_URL_LAUNCH_FIELDS = new Set(["kind", "url"]);
const HEALTH_FIELDS = new Set(["path", "expectStatus"]);
const PERMISSION_FIELDS = new Set(["workspace"]);
const WORKSPACE_PERMISSIONS = new Set(["read", "write"]);
const TEMPLATE_PATTERN = /\$\{([A-Za-z][A-Za-z0-9_]*)\}/g;

export class AppPreviewManifestError extends Error {
  constructor(message, code = "manifest-invalid") {
    super(message);
    this.name = "AppPreviewManifestError";
    this.code = code;
  }
}

export function parseAppPreviewManifest(content, { appPath = "app.puppyoneapp" } = {}) {
  let value;
  try {
    value = JSON.parse(String(content ?? ""));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AppPreviewManifestError(`App manifest is not valid JSON. ${detail}`, "manifest-json-invalid");
  }
  return normalizeAppPreviewManifest(value, { appPath });
}

export function normalizeAppPreviewManifest(value, { appPath = "app.puppyoneapp" } = {}) {
  assertRecord(value, "App manifest");
  assertKnownFields(value, TOP_LEVEL_FIELDS, "App manifest");
  if (value.type !== APP_PREVIEW_TYPE) {
    throw new AppPreviewManifestError(`App manifest type must be "${APP_PREVIEW_TYPE}".`);
  }
  if (Number(value.version) !== APP_PREVIEW_VERSION) {
    throw new AppPreviewManifestError("Unsupported PuppyOne App manifest version.", "manifest-version-unsupported");
  }

  return Object.freeze({
    id: normalizeOptionalString(value.id, 160),
    name: normalizeString(value.name, basenameWithoutAppExtension(appPath), 120),
    type: APP_PREVIEW_TYPE,
    version: APP_PREVIEW_VERSION,
    launch: value.launch == null ? null : normalizeLaunch(value.launch),
    permissions: normalizePermissions(value.permissions),
  });
}

export function interpolateAppPreviewTemplate(value, variables, label = "App preview template") {
  if (typeof value !== "string") {
    throw new AppPreviewManifestError(`${label} must be a string.`);
  }
  const supplied = variables && typeof variables === "object" ? variables : {};
  return value.replace(TEMPLATE_PATTERN, (_match, key) => {
    if (!APP_PREVIEW_TEMPLATE_VARIABLES.includes(key) || !(key in supplied)) {
      throw new AppPreviewManifestError(`${label} uses unsupported variable \${${key}}.`);
    }
    const replacement = String(supplied[key]);
    if (!replacement || replacement.includes("\0")) {
      throw new AppPreviewManifestError(`${label} resolved ${key} to an invalid value.`);
    }
    return replacement;
  });
}

export function interpolateAppPreviewCommand(command, variables) {
  if (!Array.isArray(command) || command.length === 0) {
    throw new AppPreviewManifestError("App preview command must be a non-empty array.");
  }
  return command.map((part, index) => interpolateAppPreviewTemplate(
    part,
    variables,
    `App preview command argument ${index + 1}`,
  ));
}

export function getAppPreviewManifestDisplayName(content, appPath = "app.puppyoneapp") {
  try {
    return parseAppPreviewManifest(content, { appPath }).name;
  } catch {
    return basenameWithoutAppExtension(appPath);
  }
}

function normalizeLaunch(value) {
  assertRecord(value, "App manifest launch config");
  if (value.kind === "static-file") {
    assertKnownFields(value, STATIC_FILE_LAUNCH_FIELDS, "App manifest static-file launch config");
    return normalizeStaticFileLaunch(value);
  }
  if (value.kind === "existing-url") {
    assertKnownFields(value, EXISTING_URL_LAUNCH_FIELDS, "App manifest existing-url launch config");
    return normalizeExistingUrlLaunch(value);
  }
  if (value.kind !== "local-server") throw new AppPreviewManifestError("Unsupported app preview launch kind.");
  assertKnownFields(value, LOCAL_SERVER_LAUNCH_FIELDS, "App manifest local-server launch config");
  if (!Array.isArray(value.command) || value.command.length === 0) {
    throw new AppPreviewManifestError("App preview command must be a non-empty array.");
  }
  const command = Object.freeze(value.command.map(normalizeCommandPart));
  const cwd = normalizePortableRelativePath(value.cwd ?? ".", "App preview cwd");
  const url = requireTemplate(value.url, "App preview URL");
  if (!url.includes("${port}")) {
    throw new AppPreviewManifestError("App preview URL must include ${port}.");
  }
  const env = normalizeEnv(value.env);
  const health = normalizeHealth(value.health);
  return Object.freeze({ kind: "local-server", command, cwd, env, url, health });
}

function normalizeStaticFileLaunch(value) {
  const filePath = normalizePortableRelativePath(value.path, "App preview HTML file");
  if (filePath === ".") {
    throw new AppPreviewManifestError("App preview HTML file must point to a file.");
  }
  return Object.freeze({ kind: "static-file", path: filePath });
}

function normalizeExistingUrlLaunch(value) {
  return Object.freeze({ kind: "existing-url", url: normalizeExternalUrl(value.url) });
}

function normalizeExternalUrl(value) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new AppPreviewManifestError("App preview URL must be a valid HTTP or HTTPS URL.");
  }
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new AppPreviewManifestError("App preview URL must be a valid HTTP or HTTPS URL.");
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol) || parsed.username || parsed.password) {
    throw new AppPreviewManifestError("App preview URL must be a credential-free HTTP or HTTPS URL.");
  }
  return parsed.href;
}

export function createUnconfiguredAppPreviewManifestContent() {
  return `${JSON.stringify({ type: APP_PREVIEW_TYPE, version: APP_PREVIEW_VERSION }, null, 2)}\n`;
}

export function isConfiguredAppPreviewManifest(manifest) {
  return Boolean(manifest?.launch);
}

function normalizeHealth(value) {
  if (value == null) return Object.freeze({ path: "/", expectStatus: 200 });
  if (typeof value === "string") {
    return Object.freeze({ path: normalizeHealthPath(value), expectStatus: 200 });
  }
  assertRecord(value, "App preview health config");
  assertKnownFields(value, HEALTH_FIELDS, "App preview health config");
  return Object.freeze({
    path: normalizeHealthPath(value.path ?? "/"),
    expectStatus: normalizeStatusCode(value.expectStatus ?? 200),
  });
}

function normalizePermissions(value) {
  if (value == null) return Object.freeze({ workspace: Object.freeze([]) });
  assertRecord(value, "App preview permissions");
  assertKnownFields(value, PERMISSION_FIELDS, "App preview permissions");
  const workspace = value.workspace ?? [];
  if (!Array.isArray(workspace)) {
    throw new AppPreviewManifestError("App preview workspace permissions must be an array.");
  }
  const normalized = [];
  for (const permission of workspace) {
    if (typeof permission !== "string" || !WORKSPACE_PERMISSIONS.has(permission)) {
      throw new AppPreviewManifestError(`Unsupported app preview workspace permission: ${String(permission)}`);
    }
    if (!normalized.includes(permission)) normalized.push(permission);
  }
  return Object.freeze({ workspace: Object.freeze(normalized) });
}

function normalizeEnv(value) {
  if (value == null) return Object.freeze({});
  assertRecord(value, "App preview env");
  const env = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
      throw new AppPreviewManifestError(`Invalid app preview env key: ${key}`);
    }
    if (typeof rawValue !== "string" || rawValue.includes("\0")) {
      throw new AppPreviewManifestError(`App preview env value for ${key} must be a string.`);
    }
    assertSupportedTemplates(rawValue, `App preview env value for ${key}`);
    env[key] = rawValue;
  }
  return Object.freeze(env);
}

function normalizeCommandPart(value) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new AppPreviewManifestError("App preview command contains an invalid value.");
  }
  const normalized = value.trim();
  assertSupportedTemplates(normalized, "App preview command");
  return normalized;
}

function requireTemplate(value, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new AppPreviewManifestError(`${label} must be a non-empty string.`);
  }
  const normalized = value.trim();
  assertSupportedTemplates(normalized, label);
  return normalized;
}

function assertSupportedTemplates(value, label) {
  for (const match of value.matchAll(TEMPLATE_PATTERN)) {
    if (!APP_PREVIEW_TEMPLATE_VARIABLES.includes(match[1])) {
      throw new AppPreviewManifestError(`${label} uses unsupported variable \${${match[1]}}.`);
    }
  }
}

function normalizePortableRelativePath(value, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new AppPreviewManifestError(`${label} must be a relative path.`);
  }
  const portablePath = value.trim().replace(/\\/g, "/");
  if (portablePath.startsWith("/") || /^[A-Za-z]:\//.test(portablePath)) {
    throw new AppPreviewManifestError(`${label} must be a relative path.`);
  }
  const parts = portablePath.split("/");
  const normalized = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (normalized.length === 0) {
        throw new AppPreviewManifestError(`${label} must stay inside the workspace.`);
      }
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }
  return normalized.length === 0 ? "." : normalized.join("/");
}

function normalizeHealthPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.includes("\0")) {
    throw new AppPreviewManifestError("App preview health path must start with /.");
  }
  return value;
}

function normalizeStatusCode(value) {
  const status = Number(value);
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new AppPreviewManifestError("App preview expected health status is invalid.");
  }
  return status;
}

function normalizeString(value, fallback, maxLength) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function normalizeOptionalString(value, maxLength) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppPreviewManifestError(`${label} must be a JSON object.`);
  }
}

function assertKnownFields(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new AppPreviewManifestError(`${label} contains unsupported fields: ${unknown.sort().join(", ")}.`);
  }
}

function basenameWithoutAppExtension(appPath) {
  const normalized = typeof appPath === "string" ? appPath.replace(/\\/g, "/") : "app.puppyoneapp";
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  return basename.toLowerCase().endsWith(APP_PREVIEW_EXTENSION)
    ? basename.slice(0, -APP_PREVIEW_EXTENSION.length)
    : basename;
}
