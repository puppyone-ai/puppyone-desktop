#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharedEditorRoot = path.join(repoRoot, "packages/shared-ui/src/editor");
const sessionKernel = path.join(
  sharedEditorRoot,
  "document-session/DocumentEditingSession.ts",
);
const errors = [];

for (const filePath of walkTypeScript(sharedEditorRoot)) {
  const source = readFileSync(filePath, "utf8");
  if (filePath !== sessionKernel && /\b(?:this\.)?persistence\.persist\s*\(/.test(source)) {
    errors.push(`${relative(filePath)} calls a persistence adapter outside DocumentEditingSession`);
  }
}

const contributionFiles = [
  ...walkTypeScript(path.join(sharedEditorRoot, "viewers")),
  ...walkTypeScript(path.join(sharedEditorRoot, "markdown")),
  ...walkTypeScript(path.join(sharedEditorRoot, "puppyflow")),
];
for (const filePath of contributionFiles) {
  const source = readFileSync(filePath, "utf8");
  for (const [pattern, reason] of [
    [/\bDocumentPersistencePort\b/, "imports the storage adapter contract"],
    [/\bdocumentPersistence\b/, "receives a storage adapter"],
    [/\bonSaveContent\b/, "owns the legacy save callback"],
    [/\b(?:window\.)?setTimeout\s*\([^)]*(?:save|persist|write)/is, "owns a save timer"],
    [/\b(?:requestSave|flushCurrent|flushSnapshot|getPersistedContent|resolveExternalConflict)\b/, "controls the host save lifecycle"],
    [/\b(?:DocumentEditingSessionHandle|useDocumentSessionState)\b/, "observes the host-only session"],
  ]) {
    if (pattern.test(source)) errors.push(`${relative(filePath)} ${reason}`);
  }
}

const textFramePath = path.join(sharedEditorRoot, "viewers/TextEditorFrame.tsx");
const textFrameSource = readFileSync(textFramePath, "utf8");
if (/\bsetTimeout\s*\(/.test(textFrameSource)) {
  errors.push(`${relative(textFramePath)} owns a timer; save scheduling belongs to DocumentEditingSession`);
}

const sessionSource = readFileSync(sessionKernel, "utf8");
if (/from\s+["'][^"']*(?:electron|localFiles|cloudDataPort|node:fs)[^"']*["']/.test(sessionSource)) {
  errors.push(`${relative(sessionKernel)} imports a storage implementation`);
}
if (!/queueMicrotask\s*\(/.test(sessionSource)) {
  errors.push(`${relative(sessionKernel)} does not schedule immediate edit persistence in a microtask`);
}
if (/\b(?:idleDelayMs|maxDelayMs|scheduleAutomaticCommit)\b/.test(sessionSource)) {
  errors.push(`${relative(sessionKernel)} still owns a delayed/idle autosave policy`);
}
if (!/readSnapshot\(\),\s*this\.strongestDrainReason\(\)\s*\?\?\s*["']edit["']/.test(sessionSource)) {
  errors.push(`${relative(sessionKernel)} does not enqueue the latest editor snapshot with the edit reason`);
}

const externalAdapterPath = path.join(sharedEditorRoot, "viewerHostAdapters.ts");
const externalAdapterSource = readFileSync(externalAdapterPath, "utf8");
for (const authority of ["EditableDocumentSource", "DocumentPersistencePort", "documentSession", "persistence"]) {
  if (new RegExp(`\\b${authority}\\b`).test(externalAdapterSource)) {
    errors.push(`${relative(externalAdapterPath)} exposes ${authority} to an external Viewer Pack`);
  }
}

const packTypesPath = path.join(sharedEditorRoot, "viewerPackTypes.ts");
const packTypesSource = readFileSync(packTypesPath, "utf8");
if (!/export type ViewerPackFormatContribution\s*=\s*\{[\s\S]*?editable:\s*false;[\s\S]*?\};/.test(packTypesSource)) {
  errors.push(`${relative(packTypesPath)} no longer fixes Viewer Pack v1 contributions to editable: false`);
}

const sharedUiPublicIndexPath = path.join(repoRoot, "packages/shared-ui/src/index.ts");
const sharedUiPublicIndexSource = readFileSync(sharedUiPublicIndexPath, "utf8");
for (const authority of [
  "DocumentEditingSession",
  "DocumentSessionBoundary",
  "DocumentEditingSessionHandle",
  "EditableDocumentSource",
  "registerActiveDocumentSession",
  "useDocumentSessionState",
  "useEditableDocumentSource",
]) {
  if (new RegExp(`\\b${authority}\\b`).test(sharedUiPublicIndexSource)) {
    errors.push(`${relative(sharedUiPublicIndexPath)} exposes host-only ${authority}`);
  }
}

const manifestSchemaPath = path.join(repoRoot, "electron/main/viewer-packs/manifest-schema.mjs");
const manifestSchemaSource = readFileSync(manifestSchemaPath, "utf8");
if (!/formats:\s*raw\.formats\.map\([\s\S]*?editable:\s*false,/.test(manifestSchemaSource)) {
  errors.push(`${relative(manifestSchemaPath)} no longer normalizes Viewer Pack v1 to editable: false`);
}

const coreTypesPath = path.join(repoRoot, "packages/shared-ui/src/core/types.ts");
const coreTypesSource = readFileSync(coreTypesPath, "utf8");
if (/\bwriteFile\??\s*:/.test(coreTypesSource)) {
  errors.push(`${relative(coreTypesPath)} exposes the legacy direct writeFile port`);
}
if (/\b(?:idleDelayMs|maxDelayMs)\b/.test(coreTypesSource)) {
  errors.push(`${relative(coreTypesPath)} exposes delayed autosave policy to persistence adapters`);
}

const markdownSnapshotTestPath = path.join(repoRoot, "tests/markdownSourceSnapshot.test.tsx");
const markdownSnapshotTestSource = readFileSync(markdownSnapshotTestPath, "utf8");
if (!/starts frontend Markdown persistence immediately after an edit transaction/.test(markdownSnapshotTestSource)) {
  errors.push(`${relative(markdownSnapshotTestPath)} does not cover immediate frontend Markdown persistence`);
}
if (!/keeps an immediate-save failure visible and retryable in auto mode/.test(markdownSnapshotTestSource)) {
  errors.push(`${relative(markdownSnapshotTestPath)} does not cover visible immediate-save failure state`);
}

const dataWorkspacePath = path.join(repoRoot, "packages/shared-ui/src/data/DataWorkspace.tsx");
const dataWorkspaceSource = readFileSync(dataWorkspacePath, "utf8");
if (!/await flushActiveDocumentSessions\("document-switch"\)[\s\S]*await onActivePathChange/.test(dataWorkspaceSource)) {
  errors.push(`${relative(dataWorkspacePath)} does not await the Document Session drain before changing files`);
}
if (!/useEditableDocumentSource\s*\(\s*\)/.test(textFrameSource)) {
  errors.push(`${relative(textFramePath)} does not use the narrow editable-source boundary`);
}
if (/\b(?:requestSave|flushCurrent|flushSnapshot|getPersistedContent|resolveExternalConflict)\b/.test(textFrameSource)) {
  errors.push(`${relative(textFramePath)} controls host persistence directly`);
}

const sourceSnapshotPath = path.join(sharedEditorRoot, "sourceSnapshot.ts");
const sourceSnapshotSource = readFileSync(sourceSnapshotPath, "utf8");
if (!/replaceContent:\s*\(content:\s*string\)\s*=>\s*EditorSourceSnapshot/.test(sourceSnapshotSource)) {
  errors.push(`${relative(sourceSnapshotPath)} does not require format-aware external replacement`);
}
for (const relativeAdapterPath of [
  "viewers/TextEditorFrame.tsx",
  "markdown/MarkdownCodeMirrorEditor.tsx",
  "puppyflow/PuppyFlowViewer.tsx",
]) {
  const adapterPath = path.join(sharedEditorRoot, relativeAdapterPath);
  if (!/\breplaceContent\s*:/.test(readFileSync(adapterPath, "utf8"))) {
    errors.push(`${relative(adapterPath)} cannot apply an accepted external version`);
  }
}

const viewerRegistryPath = path.join(sharedEditorRoot, "viewerRegistry.tsx");
const viewerRegistrySource = readFileSync(viewerRegistryPath, "utf8");
if (!/id:\s*["']puppyflow["'][\s\S]*?import\(["']\.\/puppyflow\/PuppyFlowViewer["']\)/.test(viewerRegistrySource)) {
  errors.push(`${relative(viewerRegistryPath)} does not route PuppyFlow through a preset contribution`);
}

const desktopWorkspaceContentPath = path.join(repoRoot, "src/features/app-shell/DesktopWorkspaceContent.tsx");
const desktopWorkspaceContentSource = readFileSync(desktopWorkspaceContentPath, "utf8");
if (/\b(?:PuppyFlowEditor|renderPreviewBody|DocumentSessionBoundary)\b/.test(desktopWorkspaceContentSource)) {
  errors.push(`${relative(desktopWorkspaceContentPath)} still special-cases a built-in editor outside the contribution router`);
}

const desktopAppPath = path.join(repoRoot, "src/App.tsx");
const desktopAppSource = readFileSync(desktopAppPath, "utf8");
if (!/flushActiveDocumentSessions\("document-close"\)/.test(desktopAppSource)) {
  errors.push(`${relative(desktopAppPath)} does not await sessions before leaving the editor surface`);
}
if (!/flushActiveDocumentSessions\("workspace-switch"\)/.test(desktopAppSource)) {
  errors.push(`${relative(desktopAppPath)} does not await sessions before workspace navigation`);
}

const localMarkdownPersistenceTestPath = path.join(
  repoRoot,
  "tests/localMarkdownEditorPersistence.test.tsx",
);
const localMarkdownPersistenceTestSource = readFileSync(localMarkdownPersistenceTestPath, "utf8");
if (!/persists a real CodeMirror edit through DataWorkspace and the local desktop bridge/.test(localMarkdownPersistenceTestSource)) {
  errors.push(`${relative(localMarkdownPersistenceTestPath)} does not cover the complete local Markdown write path`);
}
if (!/keeps the local editor mounted when its pre-navigation save fails/.test(localMarkdownPersistenceTestSource)) {
  errors.push(`${relative(localMarkdownPersistenceTestPath)} does not cover failed local navigation drain`);
}

const closeDrainSources = [
  {
    filePath: path.join(sharedEditorRoot, "document-session/activeDocumentSessions.ts"),
    pattern: /registration\.tokens\.size\s*>\s*0[\s\S]*session\.dispose\(\)[\s\S]*session\.flushCurrent\("destroy"\)/,
    reason: "does not defer disposal until real retirement or retain the retiring session for app-close draining",
  },
  {
    filePath: path.join(repoRoot, "src/main.tsx"),
    pattern: /onDocumentSessionFlushRequested[\s\S]*setCloseInteractionBarrier\(true\)[\s\S]*flushActiveDocumentSessions[\s\S]*onDocumentSessionCloseCancelled[\s\S]*setCloseInteractionBarrier\(false\)/,
    reason: "does not bridge Electron close requests through an interaction barrier to the active session registry",
  },
  {
    filePath: path.join(repoRoot, "electron/preload.cjs"),
    pattern: /^(?=[\s\S]*document-session:flush-requested)(?=[\s\S]*document-session:flush-result)(?=[\s\S]*document-session:close-cancelled)/,
    reason: "does not expose the narrow close-drain handshake",
  },
  {
    filePath: path.join(repoRoot, "electron/main.mjs"),
    pattern: /documentSessionCloseCoordinator\.attachWindow\s*\(\s*window\s*\)/,
    reason: "does not gate BrowserWindow close on Document Session drain",
  },
  {
    filePath: path.join(repoRoot, "electron/main.mjs"),
    pattern: /app\.on\("will-quit",[\s\S]*cloudAuthService\.dispose\(\)[\s\S]*app\.on\("before-quit"/,
    reason: "disposes Cloud persistence dependencies before document close draining",
  },
  {
    filePath: path.join(repoRoot, "electron/main.mjs"),
    pattern: /onCloseCancelled:\s*applicationQuitIntent\.cancel[\s\S]*window-all-closed[\s\S]*applicationQuitIntent\.resumeAfterLastWindowClosed/,
    reason: "does not preserve and cancel app-quit intent across the asynchronous close gate",
  },
];
for (const { filePath, pattern, reason } of closeDrainSources) {
  if (!pattern.test(readFileSync(filePath, "utf8"))) {
    errors.push(`${relative(filePath)} ${reason}`);
  }
}

const documentSessionBoundaryPath = path.join(
  sharedEditorRoot,
  "document-session/DocumentSessionBoundary.tsx",
);
const documentSessionBoundarySource = readFileSync(documentSessionBoundaryPath, "utf8");
if (/session\.dispose\(\)/.test(documentSessionBoundarySource)) {
  errors.push(
    `${relative(documentSessionBoundaryPath)} permanently disposes a live Session during React StrictMode's cleanup/setup probe`,
  );
}

if (errors.length > 0) {
  console.error("Document Session architecture boundary check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Document Session architecture boundary check passed.");

function* walkTypeScript(directory) {
  for (const entry of readdirSync(directory)) {
    const filePath = path.join(directory, entry);
    const stats = statSync(filePath);
    if (stats.isDirectory()) yield* walkTypeScript(filePath);
    else if (/\.tsx?$/.test(filePath)) yield filePath;
  }
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}
