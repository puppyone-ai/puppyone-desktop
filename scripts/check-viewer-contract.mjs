#!/usr/bin/env node

import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { capabilityForCoreViewer } from "../electron/main/viewer-packs/preset-viewer-manifest.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const formatRegistry = require("../vendor/shared-ui/src/core/fileFormats.json");
const errors = [];

for (const format of [...(formatRegistry.formats ?? []), formatRegistry.unknownFormat]) {
  try {
    capabilityForCoreViewer(format?.defaultViewer ?? "");
  } catch (error) {
    errors.push(`format ${format?.id ?? "<unknown>"}: ${error.message}`);
  }
}

const presetCoreFiles = [
  path.join(repoRoot, "vendor/shared-ui/src/editor/viewerRegistry.tsx"),
  path.join(repoRoot, "vendor/shared-ui/src/editor/viewerTypes.ts"),
  ...walkFiles(path.join(repoRoot, "vendor/shared-ui/src/editor/viewers")),
];
for (const filePath of presetCoreFiles) {
  const source = readFileSync(filePath, "utf8");
  if (/from\s+["'][^"']*(?:viewerPack|viewerHostAdapters)[^"']*["']/.test(source)) {
    errors.push(
      `${path.relative(repoRoot, filePath)} imports external Viewer Pack authority into the preset layer`,
    );
  }
}

const mainSource = readFileSync(path.join(repoRoot, "electron/main.mjs"), "utf8");
if (/from\s+["']\.\/main\/viewer-packs\/index\.mjs["']/.test(mainSource)) {
  errors.push("electron/main.mjs statically imports the dormant Viewer Pack runtime");
}

const desktopWorkspaceSource = readFileSync(
  path.join(repoRoot, "src/features/app-shell/DesktopWorkspaceContent.tsx"),
  "utf8",
);
if (/from\s+["']\.\.\/viewer-packs["']/.test(desktopWorkspaceSource)) {
  errors.push("DesktopWorkspaceContent statically imports the dormant Viewer Pack renderer chunk");
}

if (errors.length > 0) {
  console.error("viewer contract boundary check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("viewer contract boundary check passed.");

function walkFiles(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const entryPath = path.join(root, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory()) files.push(...walkFiles(entryPath));
    else if (/\.(ts|tsx)$/.test(entryPath)) files.push(entryPath);
  }
  return files;
}
