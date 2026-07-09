export function registerLocalFileProtocol({
  protocol,
  readWorkspaceFile,
  getMimeType,
  canonicalizeWorkspacePath,
  isOpenWorkspaceRoot,
  validateCapability,
  applicationUrl,
}) {
  protocol.handle("puppyone-local", async (request) => {
    try {
      if (request.method && request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }
      const corsOrigin = getTrustedCorsOrigin(request, applicationUrl);
      if (corsOrigin === false) return new Response("Forbidden", { status: 403 });

      const { rootPath, relativePath, token } = parseLocalFileUrl(request.url);
      const canonicalRoot = typeof canonicalizeWorkspacePath === "function"
        ? await canonicalizeWorkspacePath(rootPath)
        : rootPath;

      if (typeof isOpenWorkspaceRoot === "function" && !isOpenWorkspaceRoot(canonicalRoot)) {
        return new Response("Forbidden", { status: 403 });
      }
      if (
        typeof validateCapability !== "function"
        || !validateCapability({ token, rootPath: canonicalRoot, relativePath })
      ) {
        return new Response("Forbidden", { status: 403 });
      }

      const contentType = getMimeType(relativePath) ?? "application/octet-stream";
      const corsHeaders = corsOrigin
        ? { "Access-Control-Allow-Origin": corsOrigin, Vary: "Origin" }
        : {};
      const securityHeaders = {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      };
      const rangeHeader = request.headers.get("range");
      const fileResult = await readWorkspaceFile(canonicalRoot, relativePath, { rangeHeader });
      if (fileResult?.unsatisfiable) {
        return new Response(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${fileResult.size}`,
            "Accept-Ranges": "bytes",
            ...securityHeaders,
            ...corsHeaders,
          },
        });
      }

      const bytes = Buffer.isBuffer(fileResult) ? fileResult : fileResult.bytes;
      const size = Buffer.isBuffer(fileResult) ? bytes.length : fileResult.size;
      const headers = {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Accept-Ranges": "bytes",
        ...securityHeaders,
        ...corsHeaders,
      };
      const responseInit = {
        status: Buffer.isBuffer(fileResult) || !fileResult.partial ? 200 : 206,
        headers,
      };

      if (!Buffer.isBuffer(fileResult) && fileResult.partial) {
        responseInit.headers = {
          ...headers,
          "Content-Range": `bytes ${fileResult.start}-${fileResult.end}/${size}`,
        };
      }

      return new Response(bytes, responseInit);
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

export function parseLocalFileUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.hostname !== "file") throw new Error("Invalid local file capability URL.");
  const segments = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  const encodedToken = segments.shift();
  const encodedRootPath = segments.shift();
  if (!encodedToken || !encodedRootPath) throw new Error("Incomplete local file capability URL.");
  return {
    rootPath: decodeURIComponent(encodedRootPath),
    relativePath: segments.map((segment) => decodeURIComponent(segment)).join("/"),
    token: decodeURIComponent(encodedToken),
  };
}

export function getTrustedCorsOrigin(request, applicationValue) {
  const origin = request?.headers?.get?.("origin") ?? null;
  if (!origin) return null;

  let applicationUrl;
  try {
    applicationUrl = new URL(applicationValue);
  } catch {
    return false;
  }
  if (applicationUrl.protocol === "file:") return origin === "null" ? "null" : false;
  if (applicationUrl.protocol === "http:" || applicationUrl.protocol === "https:") {
    return origin === applicationUrl.origin ? origin : false;
  }
  return false;
}
