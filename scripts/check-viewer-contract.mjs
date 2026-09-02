#!/usr/bin/env node

import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPresetViewerDefinitionForViewerId } from "../electron/main/viewer-packs/preset-viewer-manifest.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const formatRegistry = require("../packages/shared-ui/src/core/fileFormats.json");
const errors = [];

for (const format of [...(formatRegistry.formats ?? []), formatRegistry.unknownFormat]) {
  try {
    const viewer = getPresetViewerDefinitionForViewerId(format?.defaultViewer ?? "");
    if (typeof format?.editable !== "boolean") {
      errors.push(`format ${format?.id ?? "<unknown>"}: editable must be a boolean`);
    } else if (format.editable && viewer.capability !== "edit") {
      errors.push(
        `format ${format.id}: editable format routes to non-editable Viewer ${format.defaultViewer}`,
      );
    }
  } catch (error) {
    errors.push(`format ${format?.id ?? "<unknown>"}: ${error.message}`);
  }
}

const presetCoreFiles = [
  ...[
    "viewerRegistry.tsx",
    "viewerTypes.ts",
    "presetViewerContribution.ts",
    "builtinViewerContributions.ts",
  ].map((fileName) => path.join(repoRoot, "packages/shared-ui/src/editor/registry", fileName)),
  path.join(repoRoot, "packages/shared-ui/src/editor/markdown/contribution.ts"),
  ...walkFiles(path.join(repoRoot, "packages/shared-ui/src/editor/viewers")),
];
for (const filePath of presetCoreFiles) {
  const source = readFileSync(filePath, "utf8");
  if (/from\s+["'][^"']*(?:viewerPack|viewerHostAdapters)[^"']*["']/.test(source)) {
    errors.push(
      `${path.relative(repoRoot, filePath)} imports external Viewer Pack authority into the preset layer`,
    );
  }
}

const documentSurfacePath = path.join(
  repoRoot,
  "packages/shared-ui/src/editor/host/DocumentSurfaceHost.tsx",
);
const documentSurfaceSource = readFileSync(documentSurfacePath, "utf8");
if (!/export function DocumentSurfacePending[\s\S]*?role="status"[\s\S]*?aria-busy="true"[\s\S]*?aria-label=\{label\}/.test(documentSurfaceSource)) {
  errors.push(
    "DocumentSurfacePending no longer provides the shared non-visual busy contract",
  );
}
if (
  !documentSurfaceSource.includes('preparation === "requires-visible"')
  || !documentSurfaceSource.includes('data-surface-preparation={entry.preparation}')
) {
  errors.push(
    "DocumentSurfaceHost no longer activates visible-first Viewers outside the hidden staging slot",
  );
}

const pdfViewerSource = readFileSync(
  path.join(repoRoot, "packages/shared-ui/src/editor/viewers/pdf/PdfViewer.tsx"),
  "utf8",
);
if (
  !pdfViewerSource.includes("getDocument({")
  || !pdfViewerSource.includes("await renderTask.promise")
  || !pdfViewerSource.includes("onFirstPageReady")
  || !pdfViewerSource.includes("PdfRenderScheduler")
  || !pdfViewerSource.includes("resolvePdfCanvasMetrics")
  || /<iframe\b/.test(pdfViewerSource)
) {
  errors.push(
    "PDF Viewer must use PDF.js canvas first-frame readiness and cannot regress to an iframe",
  );
}

const pdfDefinition = getPresetViewerDefinitionForViewerId("pdf-preview");
if (
  pdfDefinition.executionIsolation !== "isolated-webcontents"
  || pdfDefinition.resourcePolicy.maxCanvasPixels <= 0
  || pdfDefinition.resourcePolicy.maxActiveCanvases <= 0
  || pdfDefinition.resourcePolicy.maxWorkers !== 1
  || pdfDefinition.recoveryPolicy.supportsSafeMode !== true
) {
  errors.push("PDF Viewer must retain isolated execution, finite resource budgets, and safe-mode recovery");
}

const presetRendererSource = readFileSync(
  path.join(repoRoot, "packages/shared-ui/src/editor/host/PresetViewerRenderer.tsx"),
  "utf8",
);
if (
  !presetRendererSource.includes('viewer.executionIsolation === "isolated-webcontents"')
  || !presetRendererSource.includes("runtimeHost.renderIsolatedSurface")
) {
  errors.push("Preset Viewer rendering no longer delegates isolated execution through the runtime Host port");
}

const editorSurfaceManagerSource = readFileSync(
  path.join(repoRoot, "electron/main/editor-surfaces/session-manager.mjs"),
  "utf8",
);
for (const token of [
  'sandbox: true',
  'contextIsolation: true',
  'nodeIntegration: false',
  '"render-process-gone"',
  '"unresponsive"',
  'forcefullyCrashRenderer',
]) {
  if (!editorSurfaceManagerSource.includes(token)) {
    errors.push(`Built-in Editor Surface fault domain is missing ${token}`);
  }
}

const documentSurfaceConsumers = [
  path.join(repoRoot, "packages/shared-ui/src/editor/host/EditorDocumentHost.tsx"),
  path.join(repoRoot, "packages/shared-ui/src/editor/host/PresetViewerRenderer.tsx"),
  ...walkFiles(path.join(repoRoot, "packages/shared-ui/src/editor/viewers")),
];
for (const filePath of documentSurfaceConsumers) {
  const source = readFileSync(filePath, "utf8");
  const sourceWithoutSharedPending = source.replace(
    /<DocumentSurfacePending\b[\s\S]*?\/>/g,
    "",
  );
  if (/t\(["']editor\.[^"']*(?:loading|renderingWord|renderingPresentation)[^"']*["']\)/i.test(sourceWithoutSharedPending)) {
    errors.push(
      `${path.relative(repoRoot, filePath)} renders document loading copy outside DocumentSurfacePending`,
    );
  }
  if (/aria-busy="true"/.test(source)) {
    errors.push(
      `${path.relative(repoRoot, filePath)} declares an ad hoc document loading placeholder instead of DocumentSurfacePending`,
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
