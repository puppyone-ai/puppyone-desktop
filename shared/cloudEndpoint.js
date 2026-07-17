export const CLOUD_API_BASE_URL_STORAGE_KEY = "puppyone.desktop.cloudApiBaseUrl";

export function normalizeCloudApiBaseUrl(apiBaseUrl) {
  if (typeof apiBaseUrl !== "string" || !apiBaseUrl.trim()) return null;

  try {
    const url = new URL(apiBaseUrl.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    // SECURITY (SSRF): only permit the PuppyOne cloud host family (+ localhost for
    // dev). Otherwise a renderer-supplied base could drive the main process to
    // fetch arbitrary internal/metadata/internet hosts via cloud:api-request.
    const host = url.hostname.toLowerCase();
    const allowedHost =
      host === "puppyone.ai" ||
      host.endsWith(".puppyone.ai") ||
      host === "localhost" ||
      host === "127.0.0.1";
    if (!allowedHost) return null;
    const loopback = host === "localhost" || host === "127.0.0.1";
    if (!loopback && url.protocol !== "https:") return null;

    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function resolveCloudApiBaseUrl(apiBaseUrl, fallback = null) {
  const resolved = normalizeCloudApiBaseUrl(apiBaseUrl) ?? normalizeCloudApiBaseUrl(fallback);
  if (!resolved) throw new Error("Cloud API base URL is not configured.");
  return resolved;
}

export function cloudApiBaseUrlFromRemote(remoteUrl) {
  if (typeof remoteUrl !== "string" || !remoteUrl.trim()) return null;

  try {
    const url = new URL(remoteUrl.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return normalizeCloudApiBaseUrl(`${url.origin}/api/v1`);
  } catch {
    return null;
  }
}

export function buildCloudApiUrl(path, apiBaseUrl) {
  return `${resolveCloudApiBaseUrl(apiBaseUrl)}${normalizeCloudApiPath(path)}`;
}

export function normalizeCloudApiPath(path) {
  if (typeof path !== "string" || !path.trim()) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function sameCloudApiBaseUrl(left, right) {
  return resolveCloudApiBaseUrl(left) === resolveCloudApiBaseUrl(right);
}

export function formatCloudApiHost(apiBaseUrl) {
  try {
    return new URL(resolveCloudApiBaseUrl(apiBaseUrl)).host;
  } catch {
    return "Cloud";
  }
}
