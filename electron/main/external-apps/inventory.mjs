import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  collectStringArray,
  normalizeContentType,
  normalizeExtension,
  readApplicationDisplayName,
  readApplicationInfoPlist,
} from "./bundle-metadata.mjs";

const APPLICATION_SCAN_ROOTS = [
  "/Applications",
  "/System/Applications",
  "/System/Applications/Utilities",
  path.join(os.homedir(), "Applications"),
];

const TEXT_DOCUMENT_EXTENSIONS = new Set([
  "bash",
  "c",
  "cc",
  "cfg",
  "conf",
  "cpp",
  "css",
  "csv",
  "diff",
  "env",
  "go",
  "h",
  "hpp",
  "htm",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "less",
  "log",
  "lua",
  "m",
  "markdown",
  "md",
  "mdown",
  "mkd",
  "mkdn",
  "mm",
  "php",
  "plist",
  "properties",
  "py",
  "rb",
  "rs",
  "rst",
  "sass",
  "scss",
  "sh",
  "sql",
  "svg",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
  "zsh",
]);

const EXTENSION_CONTENT_TYPE_HINTS = new Map([
  ["md", ["net.daringfireball.markdown", "public.markdown", "net.ia.markdown", "com.unknown.md"]],
  ["markdown", ["net.daringfireball.markdown", "public.markdown", "net.ia.markdown", "com.unknown.md"]],
  ["pdf", ["com.adobe.pdf", "public.pdf"]],
  ["png", ["public.png", "public.image"]],
  ["jpg", ["public.jpeg", "public.image"]],
  ["jpeg", ["public.jpeg", "public.image"]],
  ["gif", ["com.compuserve.gif", "public.image"]],
  ["heic", ["public.heic", "public.image"]],
  ["webp", ["org.webmproject.webp", "public.image"]],
  ["html", ["public.html", "public.xhtml"]],
  ["htm", ["public.html", "public.xhtml"]],
  ["rtf", ["public.rtf"]],
  ["doc", ["com.microsoft.word.doc"]],
  ["docx", ["org.openxmlformats.wordprocessingml.document"]],
  ["csv", ["public.comma-separated-values-text", "public.delimited-values-text"]],
  ["json", ["public.json"]],
  ["xml", ["public.xml"]],
  ["plist", ["com.apple.property-list", "public.xml"]],
]);

const PREFERRED_TEXT_APP_NAMES = [
  "cursor",
  "visual studio code",
  "code",
  "warp",
  "zed",
  "sublime text",
  "bbedit",
  "coteditor",
  "textedit",
];

let applicationInventoryCache = null;

export function getApplicationCandidatesForExtension(extension) {
  const normalizedExtension = normalizeExtension(extension);
  if (!normalizedExtension || process.platform !== "darwin") return [];

  return getApplicationInventory()
    .map((candidate) => ({
      ...candidate,
      score: scoreApplicationCandidate(candidate, normalizedExtension),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => (
      b.score - a.score
      || a.appName.localeCompare(b.appName)
    ));
}

function getApplicationInventory() {
  if (applicationInventoryCache) return applicationInventoryCache;

  const seenPaths = new Set();
  const appPaths = [];
  for (const scanRoot of APPLICATION_SCAN_ROOTS) {
    collectApplicationBundlePaths(scanRoot, 2, appPaths, seenPaths);
  }

  applicationInventoryCache = appPaths
    .map(readApplicationBundleMetadata)
    .filter(Boolean);
  return applicationInventoryCache;
}

function collectApplicationBundlePaths(directory, depth, appPaths, seenPaths) {
  if (depth < 0 || seenPaths.has(directory)) return;
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.name.endsWith(".app")) {
      const normalizedPath = path.resolve(entryPath);
      if (!seenPaths.has(normalizedPath)) {
        seenPaths.add(normalizedPath);
        appPaths.push(normalizedPath);
      }
      continue;
    }
    collectApplicationBundlePaths(entryPath, depth - 1, appPaths, seenPaths);
  }
}

function readApplicationBundleMetadata(appPath) {
  const info = readApplicationInfoPlist(appPath);
  if (!info) return null;

  try {
    const documentTypes = Array.isArray(info.CFBundleDocumentTypes) ? info.CFBundleDocumentTypes : [];
    const extensions = new Set();
    const contentTypes = new Set();
    for (const documentType of documentTypes) {
      collectStringArray(documentType?.CFBundleTypeExtensions, extensions, normalizeExtension);
      collectStringArray(documentType?.LSItemContentTypes, contentTypes, normalizeContentType);
    }

    return {
      appName: readApplicationDisplayName(info, appPath),
      appPath,
      bundleId: typeof info.CFBundleIdentifier === "string" ? info.CFBundleIdentifier : null,
      contentTypes,
      extensions,
    };
  } catch {
    return null;
  }
}

function scoreApplicationCandidate(candidate, extension) {
  if (candidate.extensions.has(extension)) {
    return 100 + getPreferredApplicationScore(candidate);
  }

  const contentTypeHints = getContentTypeHintsForExtension(extension);
  for (const contentType of contentTypeHints) {
    if (candidate.contentTypes.has(contentType)) {
      return 78 + getPreferredApplicationScore(candidate);
    }
  }

  if (
    TEXT_DOCUMENT_EXTENSIONS.has(extension)
    && (
      candidate.contentTypes.has("public.text")
      || candidate.contentTypes.has("public.plain-text")
      || candidate.contentTypes.has("public.source-code")
    )
  ) {
    return 58 + getPreferredApplicationScore(candidate);
  }

  return 0;
}

function getContentTypeHintsForExtension(extension) {
  const hints = EXTENSION_CONTENT_TYPE_HINTS.get(extension) ?? [];
  if (!TEXT_DOCUMENT_EXTENSIONS.has(extension)) return hints;
  return [
    ...hints,
    "public.plain-text",
    "public.text",
    "public.source-code",
  ];
}

function getPreferredApplicationScore(candidate) {
  const appName = candidate.appName.toLowerCase();
  const bundleId = candidate.bundleId?.toLowerCase() ?? "";
  const preferredIndex = PREFERRED_TEXT_APP_NAMES.findIndex((name) => (
    appName === name || appName.includes(name) || bundleId.includes(name.replaceAll(" ", ""))
  ));
  if (preferredIndex < 0) return 0;
  return Math.max(1, PREFERRED_TEXT_APP_NAMES.length - preferredIndex);
}
