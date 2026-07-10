/**
 * Workspace asset policy for Markdown media resolution.
 * Brokers must evaluate hrefs here before calling any host resolver.
 */

export const MARKDOWN_ASSET_POLICY_VERSION = "2026-07-10";
export const MARKDOWN_ASSET_MAX_DATA_URL_BYTES = 2 * 1024 * 1024;
export const MARKDOWN_ASSET_MAX_IN_FLIGHT = 8;

export type MarkdownAssetPolicyContext = {
  documentPath: string;
  workspaceRoot?: string | null;
  allowRemoteHttp?: boolean;
};

export type MarkdownAssetPolicyResult =
  | {
      ok: true;
      kind: "workspace-relative";
      path: string;
      mimeType: string | null;
    }
  | {
      ok: true;
      kind: "safe-direct";
      url: string;
      mimeType: string | null;
    }
  | {
      ok: true;
      kind: "data-image";
      url: string;
      mimeType: string;
    }
  | {
      ok: false;
      reason: string;
    };

const SAFE_DIRECT_IMAGE = /^(https?:|blob:|puppyone-local:)/i;
const DATA_IMAGE = /^data:(image\/[a-z0-9.+-]+)(;[^,]*)?,/i;

/**
 * Evaluate a Markdown image/asset href for brokered resolution.
 * Safe direct https/blob/puppyone-local URLs may be used without a host
 * filesystem resolver. Workspace-relative paths require a resolver and must
 * remain inside the workspace root when one is provided.
 */
export function evaluateMarkdownAssetHref(
  href: string,
  context: MarkdownAssetPolicyContext,
): MarkdownAssetPolicyResult {
  const trimmed = href.trim();
  if (!trimmed) return { ok: false, reason: "empty-href" };

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("file:")) return { ok: false, reason: "file-scheme-denied" };
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:")) {
    return { ok: false, reason: "executable-scheme-denied" };
  }

  if (lower.startsWith("data:")) {
    return evaluateDataImageHref(trimmed);
  }

  if (SAFE_DIRECT_IMAGE.test(trimmed)) {
    if (/^https?:/i.test(trimmed) && context.allowRemoteHttp !== true) {
      // Remote http(s) images are allowed as direct safe URLs in the image
      // atom path (isSafeMarkdownImageUrl), but workspace-asset broker
      // resolution must not fetch arbitrary remote URLs unless granted.
      return {
        ok: true,
        kind: "safe-direct",
        url: trimmed,
        mimeType: guessMimeFromHref(trimmed),
      };
    }
    return {
      ok: true,
      kind: "safe-direct",
      url: trimmed,
      mimeType: guessMimeFromHref(trimmed),
    };
  }

  if (trimmed.startsWith("#") || hasUrlScheme(trimmed)) {
    return { ok: false, reason: "unsupported-scheme" };
  }

  const resolvedPath = resolveWorkspaceRelativePath(context.documentPath, trimmed);
  if (!resolvedPath) return { ok: false, reason: "path-unresolvable" };

  if (context.workspaceRoot) {
    const contained = isPathInsideWorkspaceRoot(context.workspaceRoot, resolvedPath);
    if (!contained) return { ok: false, reason: "workspace-escape" };
  }

  if (resolvedPath.split(/[\\/]/).some((segment) => segment === ".." || segment === "")) {
    return { ok: false, reason: "invalid-path-segment" };
  }

  return {
    ok: true,
    kind: "workspace-relative",
    path: resolvedPath,
    mimeType: guessMimeFromHref(resolvedPath),
  };
}

export function isBrokerSafeResolvedAssetUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^file:/i.test(trimmed)) return false;
  if (/^(javascript:|vbscript:)/i.test(trimmed)) return false;
  if (/^data:/i.test(trimmed)) {
    return evaluateDataImageHref(trimmed).ok;
  }
  return /^(https?:|blob:|puppyone-local:)/i.test(trimmed);
}

function evaluateDataImageHref(href: string): MarkdownAssetPolicyResult {
  const match = DATA_IMAGE.exec(href);
  if (!match) return { ok: false, reason: "data-not-image" };
  const mimeType = match[1].toLowerCase();
  if (mimeType === "image/svg+xml") {
    return { ok: false, reason: "data-svg-denied" };
  }

  const comma = href.indexOf(",");
  if (comma < 0) return { ok: false, reason: "data-malformed" };
  const payload = href.slice(comma + 1);
  const isBase64 = /;base64/i.test(href.slice(0, comma));
  const estimatedBytes = isBase64
    ? Math.floor((payload.length * 3) / 4)
    : unescape(payload).length;
  if (estimatedBytes > MARKDOWN_ASSET_MAX_DATA_URL_BYTES) {
    return { ok: false, reason: "data-too-large" };
  }

  return { ok: true, kind: "data-image", url: href, mimeType };
}

export function resolveWorkspaceRelativePath(sourcePath: string, href: string): string | null {
  const trimmedHref = href.trim();
  if (!trimmedHref || SAFE_DIRECT_IMAGE.test(trimmedHref) || trimmedHref.startsWith("data:")) {
    return null;
  }
  if (trimmedHref.startsWith("#") || hasUrlScheme(trimmedHref)) return null;

  const sourceParts = sourcePath.split(/[\\/]+/).filter(Boolean);
  if (!trimmedHref.startsWith("/")) sourceParts.pop();

  const parts = trimmedHref.startsWith("/") ? [] : [...sourceParts];
  for (const segment of stripUrlSuffix(trimmedHref).split(/[\\/]+/)) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(decodePathSegment(segment));
    }
  }

  return parts.length > 0 ? parts.join("/") : null;
}

export function isPathInsideWorkspaceRoot(workspaceRoot: string, candidatePath: string): boolean {
  const root = normalizePathForCompare(workspaceRoot);
  const candidate = normalizePathForCompare(candidatePath);
  if (!root) return false;
  if (candidate === root) return true;
  return candidate.startsWith(`${root}/`);
}

function normalizePathForCompare(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "")
    .toLowerCase();
}

function hasUrlScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function stripUrlSuffix(value: string): string {
  const index = value.search(/[?#]/);
  return index === -1 ? value : value.slice(0, index);
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function guessMimeFromHref(href: string): string | null {
  const clean = stripUrlSuffix(href).toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".avif")) return "image/avif";
  if (clean.endsWith(".bmp")) return "image/bmp";
  if (clean.endsWith(".ico")) return "image/x-icon";
  if (clean.endsWith(".svg")) return "image/svg+xml";
  return null;
}
