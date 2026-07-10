/**
 * Viewer Pack manifest schema validation (API v1).
 * Unknown permission keys fail closed. Network permissions must be empty.
 */

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
const ALLOWED_RELATED_FILES = new Set(["none", "same-directory"]);
const ALLOWED_RUNTIME = new Set(["worker", "webgl", "webgpu", "wasm"]);
const ALLOWED_SOURCES = new Set(["local"]);
const ALLOWED_VIEWER_SOURCE = new Set(["range-resource", "resource", "none"]);

const PLUGIN_ID_RE = /^[a-z][a-z0-9.-]*\.[a-z0-9.-]+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$/;

export function validateViewerPackManifest(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["manifest-not-object"] };
  }

  if (raw.schemaVersion !== 1) errors.push("schemaVersion-unsupported");
  if (typeof raw.id !== "string" || !PLUGIN_ID_RE.test(raw.id)) errors.push("id-invalid");
  if (typeof raw.publisher !== "string" || !raw.publisher.trim()) errors.push("publisher-required");
  if (typeof raw.version !== "string" || !SEMVER_RE.test(raw.version)) errors.push("version-invalid");

  if (!raw.engines || typeof raw.engines !== "object") {
    errors.push("engines-required");
  } else {
    if (typeof raw.engines.puppyone !== "string" || !raw.engines.puppyone.trim()) {
      errors.push("engines.puppyone-required");
    }
    if (String(raw.engines.viewerApi) !== "1") errors.push("engines.viewerApi-unsupported");
  }

  if (!raw.viewer || typeof raw.viewer !== "object") {
    errors.push("viewer-required");
  } else {
    const entry = normalizePackRelativePath(raw.viewer.entry);
    if (!entry.ok) errors.push(`viewer.entry-${entry.reason}`);
    if (!ALLOWED_VIEWER_SOURCE.has(raw.viewer.source)) errors.push("viewer.source-invalid");
    if (!Array.isArray(raw.viewer.sources) || raw.viewer.sources.length === 0) {
      errors.push("viewer.sources-required");
    } else if (raw.viewer.sources.some((item) => !ALLOWED_SOURCES.has(item))) {
      errors.push("viewer.sources-invalid");
    }
    if (!Array.isArray(raw.viewer.runtime)) {
      errors.push("viewer.runtime-required");
    } else if (raw.viewer.runtime.some((item) => !ALLOWED_RUNTIME.has(item))) {
      errors.push("viewer.runtime-invalid");
    }
  }

  if (!Array.isArray(raw.formats) || raw.formats.length === 0) {
    errors.push("formats-required");
  } else {
    for (const [index, format] of raw.formats.entries()) {
      const prefix = `formats[${index}]`;
      if (!format || typeof format !== "object") {
        errors.push(`${prefix}-invalid`);
        continue;
      }
      if (typeof format.id !== "string" || !format.id.trim()) errors.push(`${prefix}.id-required`);
      if (typeof format.label !== "string" || !format.label.trim()) errors.push(`${prefix}.label-required`);
      if (!Array.isArray(format.extensions) || format.extensions.length === 0) {
        errors.push(`${prefix}.extensions-required`);
      } else if (format.extensions.some((ext) => typeof ext !== "string" || !ext.startsWith("."))) {
        errors.push(`${prefix}.extensions-invalid`);
      }
      if (!Array.isArray(format.mimeTypes)) errors.push(`${prefix}.mimeTypes-required`);
      if (typeof format.defaultViewer !== "string" || !format.defaultViewer.startsWith("plugin:")) {
        errors.push(`${prefix}.defaultViewer-must-be-plugin`);
      } else if (RESERVED_CORE_VIEWER_IDS.has(format.defaultViewer.replace(/^plugin:/, ""))) {
        errors.push(`${prefix}.defaultViewer-reserved-core-id`);
      }
      if (format.editable !== false) errors.push(`${prefix}.editable-must-be-false`);
    }
  }

  if (!raw.permissions || typeof raw.permissions !== "object" || Array.isArray(raw.permissions)) {
    errors.push("permissions-required");
  } else {
    const unknownKeys = Object.keys(raw.permissions).filter(
      (key) => !["currentDocument", "relatedFiles", "network"].includes(key),
    );
    if (unknownKeys.length > 0) errors.push("permissions-unknown-keys");

    if (!Array.isArray(raw.permissions.currentDocument) || raw.permissions.currentDocument.length === 0) {
      errors.push("permissions.currentDocument-required");
    } else if (raw.permissions.currentDocument.some((item) => !ALLOWED_CURRENT_DOCUMENT.has(item))) {
      errors.push("permissions.currentDocument-invalid");
    }

    if (!ALLOWED_RELATED_FILES.has(raw.permissions.relatedFiles)) {
      errors.push("permissions.relatedFiles-invalid");
    }

    if (!Array.isArray(raw.permissions.network)) {
      errors.push("permissions.network-required");
    } else if (raw.permissions.network.length > 0) {
      errors.push("permissions.network-must-be-empty-v1");
    }
  }

  if (Array.isArray(raw.activationEvents)) {
    // Activation events must be derivable from formats; reject startup activation.
    if (raw.activationEvents.some((event) => event === "*" || event === "onStartup")) {
      errors.push("activationEvents-startup-forbidden");
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const entry = normalizePackRelativePath(raw.viewer.entry);
  const activationEvents = raw.formats.flatMap((format) =>
    format.extensions.map((extension) => `onFileExtension:${extension.toLowerCase()}`),
  );

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      id: raw.id,
      publisher: raw.publisher.trim(),
      version: raw.version,
      engines: {
        puppyone: raw.engines.puppyone.trim(),
        viewerApi: "1",
      },
      activationEvents,
      viewer: {
        entry: entry.path,
        source: raw.viewer.source,
        sources: ["local"],
        runtime: [...raw.viewer.runtime],
      },
      formats: raw.formats.map((format) => ({
        id: format.id,
        label: format.label,
        extensions: format.extensions.map((item) => item.toLowerCase()),
        mimeTypes: format.mimeTypes.map((item) => String(item).toLowerCase()),
        category: String(format.category ?? "binary"),
        defaultViewer: format.defaultViewer,
        editable: false,
      })),
      permissions: {
        currentDocument: [...raw.permissions.currentDocument],
        relatedFiles: raw.permissions.relatedFiles,
        network: [],
      },
    },
  };
}

export function normalizePackRelativePath(value) {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, reason: "empty" };
  }
  const trimmed = value.trim().replace(/\\/g, "/");
  if (trimmed.startsWith("/") || trimmed.includes("\0") || trimmed.includes("//")) {
    return { ok: false, reason: "absolute-or-empty-segment" };
  }
  const segments = trimmed.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || /[\u0000-\u001f]/.test(segment))) {
    return { ok: false, reason: "traversal-or-control" };
  }
  return { ok: true, path: segments.join("/") };
}

export function isReservedCoreViewerId(id) {
  return RESERVED_CORE_VIEWER_IDS.has(id);
}
