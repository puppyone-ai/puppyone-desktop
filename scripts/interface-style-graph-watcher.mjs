import { watch } from "node:fs";
import path from "node:path";

const STYLE_GRAPH_ASSET_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
  ".woff",
  ".woff2",
]);

export function isInterfaceStyleGraphChange(eventType, fileName) {
  const changedFile = String(fileName ?? "");
  const extension = path.extname(changedFile).toLowerCase();

  if (extension === ".css") {
    return path.basename(changedFile) === "index.css" || eventType === "rename";
  }

  // Vite can retain a negative resolution result when CSS references an asset
  // that is created after the dev server starts. Content edits to an existing
  // asset still use normal HMR; additions, removals, and renames must rebuild
  // the renderer dependency graph so the URL is resolved instead of falling
  // through to the SPA document.
  return eventType === "rename" && STYLE_GRAPH_ASSET_EXTENSIONS.has(extension);
}

export function watchInterfaceStyleGraph(rootPath, onGraphChange, watchImplementation = watch) {
  return watchImplementation(rootPath, { recursive: true }, (eventType, fileName) => {
    const changedFile = String(fileName ?? "");
    if (!isInterfaceStyleGraphChange(eventType, changedFile)) return;
    onGraphChange({ eventType, fileName: changedFile });
  });
}
