import semver from "semver";

/** Strict Viewer Pack manifest validation for API v1. */

const RESERVED_CORE_VIEWER_IDS = new Set([
  "app-preview",
  "markdown",
  "json",
  "csv-table",
  "html-artifact",
  "image-preview",
  "pdf-preview",
  "office-preview",
  "audio-preview",
  "video-preview",
  "text",
  "document-placeholder",
  "binary-placeholder",
  "monaco-code",
  "plain-text",
  "markdown-editor",
]);

const ALLOWED_CURRENT_DOCUMENT = new Set(["metadata", "readRange"]);
const ALLOWED_RUNTIME = new Set(["worker", "webgl", "webgpu", "wasm"]);
const ALLOWED_VIEWER_SOURCE = new Set(["range-resource", "resource", "none"]);
const TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "id",
  "publisher",
  "version",
  "engines",
  "activationEvents",
  "viewer",
  "formats",
  "permissions",
]);

export const VIEWER_PACK_ID_RE = /^[a-z][a-z0-9-]{0,62}(?:\.[a-z0-9][a-z0-9-]{0,62}){1,7}$/;
export const VIEWER_PACK_PUBLISHER_RE = /^[a-z0-9][a-z0-9._-]{1,127}$/;

const FORMAT_ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const EXTENSION_RE = /^\.[a-z0-9][a-z0-9._+-]{0,63}$/;
const MIME_RE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const CATEGORY_RE = /^[a-z][a-z0-9-]{0,31}$/;

export function validateViewerPackManifest(raw) {
  const errors = [];
  if (!isRecord(raw)) return { ok: false, errors: ["manifest-not-object"] };

  rejectUnknownKeys(raw, TOP_LEVEL_KEYS, "manifest-unknown-keys", errors);
  if (raw.schemaVersion !== 1) errors.push("schemaVersion-unsupported");
  if (!isValidViewerPackId(raw.id)) errors.push("id-invalid");
  if (typeof raw.publisher !== "string" || !VIEWER_PACK_PUBLISHER_RE.test(raw.publisher)) {
    errors.push("publisher-invalid");
  }
  if (typeof raw.version !== "string" || semver.valid(raw.version) !== raw.version) {
    errors.push("version-invalid");
  }

  validateEngines(raw.engines, errors);
  validateViewer(raw.viewer, errors);
  validateFormats(raw.formats, raw.id, errors);
  validatePermissions(raw.permissions, raw.viewer, errors);
  validateActivationEvents(raw.activationEvents, raw.formats, errors);

  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };

  const entry = normalizePackRelativePath(raw.viewer.entry);
  const activationEvents = deriveActivationEvents(raw.formats);
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      id: raw.id,
      publisher: raw.publisher,
      version: raw.version,
      engines: {
        puppyone: raw.engines.puppyone,
        viewerApi: "1",
      },
      activationEvents,
      viewer: {
        entry: entry.path,
        source: raw.viewer.source,
        sources: ["local"],
        runtime: unique(raw.viewer.runtime).sort(),
      },
      formats: raw.formats.map((format) => ({
        id: format.id,
        label: format.label.trim(),
        extensions: unique(format.extensions.map(normalizeExtension)).sort(),
        mimeTypes: unique(format.mimeTypes.map(normalizeMime)).sort(),
        category: format.category,
        defaultViewer: format.defaultViewer,
        editable: false,
      })),
      permissions: {
        currentDocument: unique(raw.permissions.currentDocument).sort(),
        relatedFiles: "none",
        network: [],
      },
    },
  };
}

export function checkViewerPackEngineCompatibility(
  manifest,
  { hostVersion, viewerApiVersion = "1" } = {},
) {
  if (!manifest || typeof manifest !== "object") {
    return { ok: false, reason: "manifest-invalid" };
  }
  if (String(manifest.engines?.viewerApi) !== String(viewerApiVersion)) {
    return { ok: false, reason: "viewer-api-incompatible" };
  }
  if (typeof hostVersion !== "string" || !semver.valid(hostVersion)) {
    return { ok: false, reason: "host-version-invalid" };
  }
  const range = manifest.engines?.puppyone;
  if (typeof range !== "string" || !semver.validRange(range)) {
    return { ok: false, reason: "host-range-invalid" };
  }
  if (!semver.satisfies(hostVersion, range, { includePrerelease: true })) {
    return { ok: false, reason: "host-version-incompatible" };
  }
  return { ok: true };
}

export function normalizePackRelativePath(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 512) {
    return { ok: false, reason: "empty-or-too-long" };
  }
  const trimmed = value.trim().replace(/\\/g, "/");
  if (
    trimmed.startsWith("/") ||
    /^[a-z]:/i.test(trimmed) ||
    trimmed.includes("\0") ||
    trimmed.includes("//")
  ) {
    return { ok: false, reason: "absolute-or-empty-segment" };
  }
  const segments = trimmed.split("/");
  if (
    segments.some((segment) =>
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.length > 255 ||
      /[\u0000-\u001f\u007f]/.test(segment))
  ) {
    return { ok: false, reason: "traversal-or-control" };
  }
  return { ok: true, path: segments.join("/") };
}

export function isValidViewerPackId(id) {
  return typeof id === "string" && id.length <= 255 && VIEWER_PACK_ID_RE.test(id);
}

export function isValidViewerPackVersion(version) {
  return typeof version === "string" && semver.valid(version) === version;
}

export function isReservedCoreViewerId(id) {
  return RESERVED_CORE_VIEWER_IDS.has(id);
}

function validateEngines(engines, errors) {
  if (!isRecord(engines)) {
    errors.push("engines-required");
    return;
  }
  rejectUnknownKeys(engines, new Set(["puppyone", "viewerApi"]), "engines-unknown-keys", errors);
  if (typeof engines.puppyone !== "string" || !semver.validRange(engines.puppyone)) {
    errors.push("engines.puppyone-invalid");
  }
  if (engines.viewerApi !== "1") errors.push("engines.viewerApi-unsupported");
}

function validateViewer(viewer, errors) {
  if (!isRecord(viewer)) {
    errors.push("viewer-required");
    return;
  }
  rejectUnknownKeys(
    viewer,
    new Set(["entry", "source", "sources", "runtime"]),
    "viewer-unknown-keys",
    errors,
  );
  const entry = normalizePackRelativePath(viewer.entry);
  if (!entry.ok) errors.push(`viewer.entry-${entry.reason}`);
  if (!ALLOWED_VIEWER_SOURCE.has(viewer.source)) errors.push("viewer.source-invalid");
  if (!Array.isArray(viewer.sources) || !sameStringSet(viewer.sources, ["local"])) {
    errors.push("viewer.sources-must-be-local-only");
  }
  if (
    !Array.isArray(viewer.runtime) ||
    viewer.runtime.length > ALLOWED_RUNTIME.size ||
    !allUniqueStrings(viewer.runtime) ||
    viewer.runtime.some((item) => !ALLOWED_RUNTIME.has(item))
  ) {
    errors.push("viewer.runtime-invalid");
  }
}

function validateFormats(formats, pluginId, errors) {
  if (!Array.isArray(formats) || formats.length === 0 || formats.length > 128) {
    errors.push("formats-invalid-count");
    return;
  }
  const seenIds = new Set();
  for (const [index, format] of formats.entries()) {
    const prefix = `formats[${index}]`;
    if (!isRecord(format)) {
      errors.push(`${prefix}-invalid`);
      continue;
    }
    rejectUnknownKeys(
      format,
      new Set(["id", "label", "extensions", "mimeTypes", "category", "defaultViewer", "editable"]),
      `${prefix}-unknown-keys`,
      errors,
    );
    if (typeof format.id !== "string" || !FORMAT_ID_RE.test(format.id) || seenIds.has(format.id)) {
      errors.push(`${prefix}.id-invalid`);
    } else {
      seenIds.add(format.id);
    }
    if (!isDisplayString(format.label, 128)) errors.push(`${prefix}.label-invalid`);
    if (
      !Array.isArray(format.extensions) ||
      format.extensions.length === 0 ||
      format.extensions.length > 64 ||
      !allUniqueStrings(format.extensions.map(normalizeExtension)) ||
      format.extensions.some((extension) => !EXTENSION_RE.test(normalizeExtension(extension)))
    ) {
      errors.push(`${prefix}.extensions-invalid`);
    }
    if (
      !Array.isArray(format.mimeTypes) ||
      format.mimeTypes.length > 64 ||
      !allUniqueStrings(format.mimeTypes.map(normalizeMime)) ||
      format.mimeTypes.some((mime) => typeof mime !== "string" || !MIME_RE.test(normalizeMime(mime)))
    ) {
      errors.push(`${prefix}.mimeTypes-invalid`);
    }
    if (typeof format.category !== "string" || !CATEGORY_RE.test(format.category)) {
      errors.push(`${prefix}.category-invalid`);
    }
    if (format.defaultViewer !== `plugin:${pluginId}`) {
      errors.push(`${prefix}.defaultViewer-must-match-plugin-id`);
    }
    if (typeof format.defaultViewer === "string" && isReservedCoreViewerId(format.defaultViewer.replace(/^plugin:/, ""))) {
      errors.push(`${prefix}.defaultViewer-reserved-core-id`);
    }
    if (format.editable !== false) errors.push(`${prefix}.editable-must-be-false`);
  }
}

function validatePermissions(permissions, viewer, errors) {
  if (!isRecord(permissions)) {
    errors.push("permissions-required");
    return;
  }
  rejectUnknownKeys(
    permissions,
    new Set(["currentDocument", "relatedFiles", "network"]),
    "permissions-unknown-keys",
    errors,
  );
  if (
    !Array.isArray(permissions.currentDocument) ||
    !allUniqueStrings(permissions.currentDocument) ||
    permissions.currentDocument.some((item) => !ALLOWED_CURRENT_DOCUMENT.has(item)) ||
    !permissions.currentDocument.includes("metadata")
  ) {
    errors.push("permissions.currentDocument-invalid");
  }
  if (viewer?.source !== "none" && !permissions.currentDocument?.includes("readRange")) {
    errors.push("permissions.currentDocument-readRange-required");
  }
  // Related-file access is intentionally not implemented in v1. Rejecting it
  // prevents the manifest from promising a permission the broker cannot enforce.
  if (permissions.relatedFiles !== "none") {
    errors.push("permissions.relatedFiles-must-be-none-v1");
  }
  if (!Array.isArray(permissions.network) || permissions.network.length > 0) {
    errors.push("permissions.network-must-be-empty-v1");
  }
}

function validateActivationEvents(events, formats, errors) {
  if (!Array.isArray(events) || !allUniqueStrings(events)) {
    errors.push("activationEvents-invalid");
    return;
  }
  if (events.some((event) => event === "*" || event === "onStartup")) {
    errors.push("activationEvents-startup-forbidden");
  }
  if (!Array.isArray(formats)) return;
  const expected = deriveActivationEvents(formats);
  if (!sameStringSet(events, expected)) errors.push("activationEvents-must-match-formats");
}

function deriveActivationEvents(formats) {
  return unique(
    (Array.isArray(formats) ? formats : []).flatMap((format) =>
      Array.isArray(format?.extensions)
        ? format.extensions
          .filter((extension) => typeof extension === "string")
          .map((extension) => `onFileExtension:${normalizeExtension(extension)}`)
        : []),
  ).sort();
}

function normalizeExtension(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeMime(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function rejectUnknownKeys(value, allowed, code, errors) {
  if (Object.keys(value).some((key) => !allowed.has(key))) errors.push(code);
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isDisplayString(value, maxLength) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function allUniqueStrings(values) {
  return Array.isArray(values) &&
    values.every((value) => typeof value === "string") &&
    new Set(values).size === values.length;
}

function sameStringSet(left, right) {
  if (!allUniqueStrings(left) || !allUniqueStrings(right)) return false;
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((item) => expected.has(item));
}

function unique(values) {
  return [...new Set(values)];
}
