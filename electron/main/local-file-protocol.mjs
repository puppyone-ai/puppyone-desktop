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
      return new Response(await readWorkspaceFile(canonicalRoot, relativePath), {
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
          "Accept-Ranges": "bytes",
        },
      });
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
