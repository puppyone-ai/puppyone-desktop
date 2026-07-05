export function registerLocalFileProtocol({
  protocol,
  readWorkspaceFile,
  getMimeType,
}) {
  protocol.handle("puppyone-local", async (request) => {
    const { rootPath, relativePath } = parseLocalFileUrl(request.url);
    const contentType = getMimeType(relativePath) ?? "application/octet-stream";
    return new Response(await readWorkspaceFile(rootPath, relativePath), {
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
      },
    });
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
