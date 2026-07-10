/**
 * `puppyone-resource://` protocol. Registered per plugin session on that
 * session's partition and bound to the session's audience, so a resource URL is
 * only ever readable from the session it was minted for. Serves bounded Range
 * reads (206 + Content-Range, 416 for unsatisfiable, no unbounded whole-file
 * buffering) through the resource broker.
 *
 * URL shape: `puppyone-resource://handle/<handleId>`
 */

import { ResourceBrokerError } from "./resource-broker.mjs";

export const RESOURCE_PROTOCOL_SCHEME = "puppyone-resource";

/**
 * Register the resource protocol on a session, bound to a fixed audience.
 * @param {object} params
 * @param {Electron.Session} params.session the plugin session
 * @param {object} params.broker resource broker
 * @param {object} params.audience { pluginId, instanceId, ownerWebContentsId }
 * @param {number} [params.maxRangeLength] cap for a single read
 */
export function registerResourceProtocol({ session, broker, audience, maxRangeLength = 8 * 1024 * 1024, logger = console }) {
  session.protocol.handle(RESOURCE_PROTOCOL_SCHEME, (request) =>
    handleResourceRequest({ request, broker, audience, maxRangeLength }).catch((error) => {
      logger.warn?.("puppyone-resource request failed:", error);
      return new Response("Resource error", { status: statusForError(error) });
    }));
}

export async function handleResourceRequest({ request, broker, audience, maxRangeLength }) {
  if (request.method && request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const handleId = parseHandleId(request.url);
  if (!handleId) {
    return new Response("Bad request", { status: 400 });
  }

  const rangeHeader = request.headers.get("range");
  const range = parseRangeHeader(rangeHeader);

  // Never read the whole file in one shot: without a Range header we serve only
  // the first bounded window and advertise 206 so the client keeps ranging.
  const start = range?.start ?? 0;
  const requestedEnd = range?.end;
  const end = Number.isSafeInteger(requestedEnd)
    ? requestedEnd
    : start + maxRangeLength - 1;

  let result;
  try {
    result = await broker.readRange({ handleId, audience, start, end });
  } catch (error) {
    if (error instanceof ResourceBrokerError && error.code === "range-not-satisfiable") {
      return new Response(null, {
        status: 416,
        headers: {
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    throw error;
  }

  const headers = {
    "Content-Type": "application/octet-stream",
    "Content-Length": String(result.bytes.length),
    "Accept-Ranges": "bytes",
    "Content-Range": `bytes ${result.start}-${result.end}/${result.totalSize}`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };

  return new Response(request.method === "HEAD" ? null : result.bytes, {
    status: 206,
    headers,
  });
}

function parseHandleId(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname !== "handle") return null;
    const segment = url.pathname.replace(/^\/+/, "").split("/")[0];
    return segment ? decodeURIComponent(segment) : null;
  } catch {
    return null;
  }
}

function parseRangeHeader(rangeHeader) {
  if (typeof rangeHeader !== "string") return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;
  const [, startValue, endValue] = match;
  if (!startValue && !endValue) return null;
  const start = startValue ? Number(startValue) : 0;
  const end = endValue ? Number(endValue) : undefined;
  if (!Number.isSafeInteger(start) || (end !== undefined && !Number.isSafeInteger(end))) return null;
  return { start, end };
}

function statusForError(error) {
  if (error instanceof ResourceBrokerError) {
    switch (error.code) {
      case "revoked":
      case "expired":
      case "audience-mismatch":
        return 403;
      case "range-not-satisfiable":
        return 416;
      case "invalid-range":
      case "range-too-large":
      case "invalid-request":
        return 400;
      default:
        return 500;
    }
  }
  return 500;
}
