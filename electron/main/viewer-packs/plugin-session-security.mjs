/**
 * Security policy applied to each Viewer Pack session partition.
 */

export function applyPluginSessionSecurity(partitionSession, { pluginId, contentHash }) {
  partitionSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  partitionSession.setPermissionCheckHandler(() => false);

  partitionSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url ?? "";
    const allowed =
      url.startsWith(`puppyone-plugin://${pluginId}/${contentHash}/`) ||
      url.startsWith("puppyone-resource://") ||
      url.startsWith("file:") || // test fallback only; production protocol should win
      url.startsWith("data:image/") ||
      url.startsWith("blob:");
    if (!allowed) {
      callback({ cancel: true });
      return;
    }
    // Deny general network.
    if (/^https?:/i.test(url) || /^wss?:/i.test(url)) {
      callback({ cancel: true });
      return;
    }
    callback({});
  });
}

export function buildPluginContentSecurityPolicy({ allowWasm = false } = {}) {
  const scriptSrc = allowWasm ? "'self' 'wasm-unsafe-eval'" : "'self'";
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: puppyone-resource:",
    "media-src 'self' blob: puppyone-resource:",
    "connect-src puppyone-resource:",
    "worker-src 'self' blob:",
  ].join("; ");
}
