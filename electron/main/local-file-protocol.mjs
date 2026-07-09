export function registerLocalFileProtocol({
  protocol,
  readWorkspaceFile,
  getMimeType,
  canonicalizeWorkspacePath,
  isOpenWorkspaceRoot,
}) {
  protocol.handle("puppyone-local", async (request) => {
    try {
      const { rootPath, relativePath } = parseLocalFileUrl(request.url);
      const canonicalRoot = typeof canonicalizeWorkspacePath === "function"
        ? await canonicalizeWorkspacePath(rootPath)
        : rootPath;

      if (typeof isOpenWorkspaceRoot === "function" && !isOpenWorkspaceRoot(canonicalRoot)) {
        return new Response("Forbidden", { status: 403 });
      }

      const contentType = getMimeType(relativePath) ?? "application/octet-stream";
      const rangeHeader = request.headers.get("range");
      const fileResult = await readWorkspaceFile(canonicalRoot, relativePath, { rangeHeader });
      if (fileResult?.unsatisfiable) {
        return new Response(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${fileResult.size}`,
            "Access-Control-Allow-Origin": "*",
            "Accept-Ranges": "bytes",
          },
        });
      }

      const bytes = Buffer.isBuffer(fileResult) ? fileResult : fileResult.bytes;
      const size = Buffer.isBuffer(fileResult) ? bytes.length : fileResult.size;
      const headers = {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
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

  if (url.hostname === "file") {
    const segments = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    const encodedRootPath = segments.shift();
    if (!encodedRootPath) {
      throw new Error("Missing local file root path.");
    }
    return {
      rootPath: decodeURIComponent(encodedRootPath),
      relativePath: segments.map((segment) => decodeURIComponent(segment)).join("/"),
    };
  }

  return {
    rootPath: decodeURIComponent(url.hostname),
    relativePath: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
  };
}
