import path from "node:path";

export function requireNonEmptyString(value, message) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
  return value.trim();
}

export function requireCloudApiPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    throw new Error("Cloud API path must be a root-relative path.");
  }
  return value;
}

export function requireSafeExternalUrl(value) {
  const rawUrl = requireNonEmptyString(value, "External URL is required.");
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("External URL is invalid.");
  }

  if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
    throw new Error("External URL protocol is not allowed.");
  }

  return url.toString();
}

export function isPotentiallyExecutableFile(filePath, stats) {
  const extension = path.extname(filePath).toLowerCase();
  if ([
    ".app",
    ".command",
    ".dmg",
    ".exe",
    ".pkg",
    ".scpt",
    ".sh",
    ".tool",
  ].includes(extension)) {
    return true;
  }

  return process.platform !== "win32" && Boolean(stats.mode & 0o111);
}

export function normalizeCloudRequestHeaders(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== "string" || !key.trim()) continue;
    if (value == null) continue;
    normalized[key] = String(value);
  }
  return normalized;
}
