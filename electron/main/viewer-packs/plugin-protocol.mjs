/**
 * `puppyone-plugin://<id>/<content-hash>/<path>` protocol. Maps ONLY to files
 * inside the enabled, immutable package version dir for `<id>` whose content
 * hash matches `<content-hash>`. A disabled pack, a hash mismatch, or a
 * traversal path all 404/403. Registered per plugin session so pack assets are
 * only reachable from that session.
 */

import fs from "node:fs/promises";

export const PLUGIN_PROTOCOL_SCHEME = "puppyone-plugin";

export function registerPluginProtocol({ session, registryService, getMimeType, logger = console }) {
  session.protocol.handle(PLUGIN_PROTOCOL_SCHEME, (request) =>
    handlePluginRequest({ request, registryService, getMimeType }).catch((error) => {
      logger.warn?.("puppyone-plugin request failed:", error);
      return new Response("Not found", { status: 404 });
    }));
}

export async function handlePluginRequest({ request, registryService, getMimeType }) {
  if (request.method && request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const parsed = parsePluginUrl(request.url);
  if (!parsed) {
    return new Response("Bad request", { status: 400 });
  }

  let resolved;
  try {
    resolved = await registryService.resolvePackageFile({
      pluginId: parsed.pluginId,
      contentHash: parsed.contentHash,
      relativePath: parsed.relativePath,
    });
  } catch {
    // Disabled pack, hash mismatch, or traversal — all indistinguishable to a
    // plugin, deliberately.
    return new Response("Not found", { status: 404 });
  }

  const bytes = await fs.readFile(resolved.absolutePath).catch(() => null);
  if (!bytes) {
    return new Response("Not found", { status: 404 });
  }

  const contentType = resolveContentType(getMimeType, resolved.absolutePath);
  return new Response(request.method === "HEAD" ? null : bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parsePluginUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const pluginId = url.hostname;
  if (!pluginId) return null;
  const segments = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const contentHash = segments.shift();
  if (!contentHash || segments.length === 0) return null;
  const relativePath = segments.join("/");
  return { pluginId, contentHash, relativePath };
}

function resolveContentType(getMimeType, absolutePath) {
  const lower = absolutePath.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".wasm")) return "application/wasm";
  const mime = typeof getMimeType === "function" ? getMimeType(absolutePath) : null;
  return mime ?? "application/octet-stream";
}
