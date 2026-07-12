export const REQUIRED_DESKTOP_BUILD_URLS = Object.freeze([
  "VITE_DESKTOP_CLOUD_API_URL",
  "VITE_DESKTOP_CLOUD_WEB_URL",
]);

export function inspectDesktopBuildEnvironment(environment) {
  const errors = [];
  for (const key of REQUIRED_DESKTOP_BUILD_URLS) {
    const rawValue = environment?.[key];
    if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
      errors.push(`${key} is required`);
      continue;
    }

    let url;
    try {
      url = new URL(rawValue);
    } catch {
      errors.push(`${key} must be an absolute http(s) URL`);
      continue;
    }

    if (url.username || url.password) {
      errors.push(`${key} must not contain credentials`);
    }
    if (url.hash || url.search) {
      errors.push(`${key} must not contain query parameters or fragments`);
    }
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
      errors.push(`${key} must use HTTPS except for a loopback development endpoint`);
    }
  }

  const apiValue = environment?.VITE_DESKTOP_CLOUD_API_URL;
  if (typeof apiValue === "string" && apiValue.trim()) {
    try {
      const apiUrl = new URL(apiValue);
      if (!apiUrl.pathname.replace(/\/$/, "").endsWith("/api/v1")) {
        errors.push("VITE_DESKTOP_CLOUD_API_URL must include the /api/v1 API base path");
      }
    } catch {
      // The general URL diagnostic above is sufficient.
    }
  }

  return errors;
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}
