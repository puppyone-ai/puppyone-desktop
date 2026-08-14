#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

for (const requiredPath of [
  "electron/main/native-surfaces/occlusion-coordinator.mjs",
  "electron/main/ipc/native-surface-occlusion-ipc.mjs",
  "src/features/native-surfaces/nativeSurfaceOcclusion.ts",
  "src/features/native-surfaces/index.ts",
]) {
  if (!existsSync(absolute(requiredPath))) {
    errors.push(`required native-surface layering path is missing: ${requiredPath}`);
  }
}

const mainSource = read("electron/main.mjs");
for (const token of [
  "createNativeSurfaceOcclusionCoordinator",
  "registerNativeSurfaceOcclusionIpcHandlers",
  "nativeSurfaceOcclusion.releaseOwner(webContentsId)",
  "nativeSurfaceOcclusion.dispose()",
]) {
  if (!mainSource.includes(token)) errors.push(`electron/main.mjs is missing ${token}`);
}

for (const relativePath of [
  "electron/main/markdown-web-embed-service.mjs",
  "electron/main/viewer-packs/session-manager.mjs",
]) {
  const source = read(relativePath);
  if (!source.includes("nativeSurfaceOcclusion?.register?.")) {
    errors.push(`${relativePath} does not register its WebContentsView with the shared occlusion coordinator`);
  }
  if (!source.includes("occluded")) {
    errors.push(`${relativePath} does not retain an explicit occlusion state`);
  }
}

const menuSource = read("src/components/DesktopMenu.tsx");
const dialogSource = read("src/components/DesktopDialog.tsx");
const overlayPortalSource = read("src/features/app-shell/DesktopOverlayPortal.tsx");
if (!menuSource.includes("useNativeSurfaceOcclusionLease")) {
  errors.push("DesktopMenuSurface must own a native-surface occlusion lease");
}
if (!dialogSource.includes("useNativeSurfaceOcclusionLease")) {
  errors.push("DesktopDialogRoot must own a native-surface occlusion lease");
}
if (!overlayPortalSource.includes("useNativeSurfaceOcclusionObserver")) {
  errors.push("DesktopOverlayPortal must observe marked cross-package and imperative overlays");
}
if (!overlayPortalSource.includes("useNativeSurfaceOcclusionLease")) {
  errors.push("DesktopOverlayLayer must own a native-surface occlusion lease");
}

for (const filePath of [
  ...walk(absolute("src")),
  ...walk(absolute("packages/shared-ui/src")),
]) {
  const source = readFileSync(filePath, "utf8");
  const rawMenuPattern = /<([a-z][\w.-]*)\b[^>]*className="[^"]*\bdesktop-menu-surface\b[^"]*"[^>]*>/gs;
  let match = rawMenuPattern.exec(source);
  while (match) {
    if (!match[0].includes('data-native-surface-occluder="true"')) {
      errors.push(`${relative(filePath)} renders a raw desktop-menu-surface without the native occlusion marker`);
    }
    match = rawMenuPattern.exec(source);
  }
}

const markdownMenuSource = read("packages/shared-ui/src/editor/markdown/features/table/tableContextMenu.ts");
if (!markdownMenuSource.includes('menu.dataset.nativeSurfaceOccluder = "true"')) {
  errors.push("The imperative Markdown table menu must opt into native-surface occlusion");
}

const appPreviewViewer = read("packages/shared-ui/src/editor/viewers/app/AppPreviewViewer.tsx");
if (!appPreviewViewer.includes("SandboxedAppFrame")) {
  errors.push("App Preview must render inside the editor DOM instead of a native surface");
}
const appPreviewHook = read("packages/shared-ui/src/editor/viewers/app/useAppPreviewSession.ts");
for (const forbidden of ["ResizeObserver", "getBoundingClientRect", "setSurfaceBounds", "attachmentId"]) {
  if (appPreviewHook.includes(forbidden)) {
    errors.push(`App Preview runtime hook must not coordinate native surface geometry (${forbidden})`);
  }
}
const appPreviewService = read("electron/main/app-preview-service.mjs");
for (const forbidden of ["WebContentsView", "setBounds", "attachmentId", "browserSurfaces"]) {
  if (appPreviewService.includes(forbidden)) {
    errors.push(`App Preview coordinator must remain runtime-only (${forbidden})`);
  }
}

const paneResizeDrag = read("packages/shared-ui/src/primitives/usePaneResizeDrag.ts");
if (paneResizeDrag.includes("nativeSurfaceOccluder")) {
  errors.push("Shared pane resize gestures must not misrepresent themselves as occluding overlays");
}
const pointerPassthrough = read("electron/main/native-surfaces/pointer-passthrough-coordinator.mjs");
if (!pointerPassthrough.includes('surfaceWebContents.on("before-mouse-event"') || !pointerPassthrough.includes("ownerWebContents.sendInputEvent")) {
  errors.push("Native surface pointer passthrough must bridge child-view drag events back to the owner renderer");
}
for (const relativePath of [
  "electron/main/markdown-web-embed-service.mjs",
  "electron/main/viewer-packs/session-manager.mjs",
]) {
  if (!read(relativePath).includes("nativeSurfacePointerPassthrough?.register?.")) {
    errors.push(`${relativePath} does not register its native view for drag pointer passthrough`);
  }
}
for (const relativePath of [
  "packages/shared-ui/src/styles/data-workspace.css",
  "src/features/data-workspace/data-shell.css",
]) {
  const source = read(relativePath);
  for (const token of [
    'data-resizable-explorer="true"',
    "var(--po-pane-resizer-hit-size, 8px)",
    "grid-column: 2",
    "inset: auto",
  ]) {
    if (!source.includes(token)) {
      errors.push(`${relativePath} does not reserve an exclusive native-safe resize gutter (${token})`);
    }
  }
}

if (errors.length > 0) {
  console.error("Native surface layering check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Native surface layering check passed.");

function absolute(relativePath) {
  return path.join(repoRoot, relativePath);
}

function read(relativePath) {
  return readFileSync(absolute(relativePath), "utf8");
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const filePath = path.join(directory, entry);
    const stats = statSync(filePath);
    if (stats.isDirectory()) files.push(...walk(filePath));
    else if (stats.isFile() && /\.(?:ts|tsx)$/.test(filePath)) files.push(filePath);
  }
  return files;
}
