import { ResourceBrokerError } from "./resource-broker.mjs";

/** Session-scoped HTTP Range facade for opaque Viewer Pack resource handles. */

export const RESOURCE_PROTOCOL_SCHEME = "puppyone-resource";

export function registerResourceProtocol({
  session,
  broker,
  audience,
  contentType = "application/octet-stream",
  maxRangeLength = 8 * 1024 * 1024,
  logger = console,
}) {
  session.protocol.handle(RESOURCE_PROTOCOL_SCHEME, (request) =>
    handleResourceRequest({
      request,
      broker,
      audience,
      contentType,
      maxRangeLength,
    }).catch((error) => {
      if (!(error instanceof ResourceBrokerError)) {
        logger.warn?.("puppyone-resource request failed:", error);
      }
      return errorResponse(error);
    }));
}

export async function handleResourceRequest({
  request,
  broker,
  audience,
  contentType = "application/octet-stream",
  maxRangeLength = 8 * 1024 * 1024,
}) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...baseHeaders(),
        "Access-Control-Allow-Headers": "Range",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      },
    });
  }
  if (request.method && request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: baseHeaders() });
  }
  const handleId = parseHandleId(request.url);
  if (!handleId) return new Response("Bad request", { status: 400, headers: baseHeaders() });

  const meta = await broker.inspect(handleId, audience);
  const rangeHeader = request.headers.get("range");
  const parsed = parseRangeHeader(rangeHeader);
  if (!parsed.ok) return new Response("Invalid Range", { status: 400, headers: baseHeaders() });

  if (meta.sizeBytes === 0) {
    if (rangeHeader) return rangeNotSatisfiable(0);
    return new Response(null, {
      status: 200,
      headers: { ...baseHeaders(), "Content-Type": sanitizeContentType(contentType), "Content-Length": "0" },
    });
  }

  const resolved = resolveRequestedRange(parsed.value, meta.sizeBytes, maxRangeLength);
  if (!resolved.ok) return rangeNotSatisfiable(meta.sizeBytes);
  const { start, end, wasRangeRequest, truncatedByHost } = resolved.value;
  const responseLength = end - start + 1;
  const partial = wasRangeRequest || truncatedByHost || responseLength !== meta.sizeBytes;
  const headers = {
    ...baseHeaders(),
    "Content-Type": sanitizeContentType(contentType),
    "Content-Length": String(responseLength),
    ...(partial ? { "Content-Range": `bytes ${start}-${end}/${meta.sizeBytes}` } : {}),
  };

  if (request.method === "HEAD") {
    return new Response(null, { status: partial ? 206 : 200, headers });
  }
  const result = await broker.readRange({ handleId, audience, start, end });
  headers["Content-Length"] = String(result.bytes.length);
  if (partial) headers["Content-Range"] = `bytes ${result.start}-${result.end}/${result.totalSize}`;
  return new Response(result.bytes, { status: partial ? 206 : 200, headers });
}

function parseHandleId(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname !== "handle") return null;
    const segments = url.pathname.replace(/^\/+/, "").split("/");
    if (segments.length !== 1 || !segments[0]) return null;
    const handle = decodeURIComponent(segments[0]);
    return handle.includes("/") || handle.includes("\\") ? null : handle;
  } catch {
    return null;
  }
}

function parseRangeHeader(rangeHeader) {
  if (rangeHeader == null) return { ok: true, value: null };
  if (typeof rangeHeader !== "string" || rangeHeader.includes(",")) return { ok: false };
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return { ok: false };
  const [, startValue, endValue] = match;
  if (!startValue && !endValue) return { ok: false };
  if (!startValue) {
    const suffixLength = Number(endValue);
    return Number.isSafeInteger(suffixLength) && suffixLength > 0
      ? { ok: true, value: { kind: "suffix", suffixLength } }
      : { ok: false };
  }
  const start = Number(startValue);
  const end = endValue ? Number(endValue) : null;
  if (!Number.isSafeInteger(start) || start < 0) return { ok: false };
  if (end !== null && (!Number.isSafeInteger(end) || end < start)) return { ok: false };
  return { ok: true, value: { kind: "absolute", start, end } };
}

function resolveRequestedRange(range, size, maxRangeLength) {
  let start = 0;
  let requestedEnd = size - 1;
  const wasRangeRequest = Boolean(range);
  if (range?.kind === "suffix") {
    start = Math.max(0, size - range.suffixLength);
  } else if (range?.kind === "absolute") {
    start = range.start;
    requestedEnd = range.end ?? size - 1;
  }
  if (start >= size) return { ok: false };
  requestedEnd = Math.min(requestedEnd, size - 1);
  const hostEnd = Math.min(requestedEnd, start + maxRangeLength - 1);
  return {
    ok: true,
    value: {
      start,
      end: hostEnd,
      wasRangeRequest,
      truncatedByHost: hostEnd < requestedEnd,
    },
  };
}

function rangeNotSatisfiable(totalSize) {
  return new Response(null, {
    status: 416,
    headers: { ...baseHeaders(), "Content-Range": `bytes */${totalSize}` },
  });
}

function errorResponse(error) {
  const status = statusForError(error);
  const totalSize = error instanceof ResourceBrokerError ? error.details?.totalSize : null;
  if (status === 416 && Number.isSafeInteger(totalSize)) return rangeNotSatisfiable(totalSize);
  return new Response("Resource error", { status, headers: baseHeaders() });
}

function statusForError(error) {
  if (!(error instanceof ResourceBrokerError)) return 500;
  switch (error.code) {
    case "revoked":
    case "expired":
    case "audience-mismatch":
      return 403;
    case "revision-mismatch":
      return 409;
    case "range-not-satisfiable":
      return 416;
    case "too-many-ranges":
    case "too-many-handles":
    case "byte-budget-exhausted":
      return 429;
    case "invalid-range":
    case "range-too-large":
    case "invalid-request":
      return 400;
    default:
      return 500;
  }
}

function baseHeaders() {
  return {
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
  };
}

function sanitizeContentType(value) {
  return typeof value === "string" && /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+(?:; charset=[\w-]+)?$/i.test(value)
    ? value
    : "application/octet-stream";
}
