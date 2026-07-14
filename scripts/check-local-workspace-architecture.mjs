#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const workspaceFacade = read("local-api/workspace.mjs");
const workspaceLines = countLines(workspaceFacade);
if (workspaceLines > 3_400) {
  errors.push(`local-api/workspace.mjs has ${workspaceLines} lines; keep the compatibility facade at or below 3,400 lines`);
}

const requiredBoundaries = [
  {
    path: "local-api/files/path-policy.mjs",
    exports: ["normalizeRelativePath", "resolveExistingWorkspacePath", "resolveWorkspacePath"],
  },
  {
    path: "local-api/files/file-format-policy.mjs",
    exports: ["classifyLocalFile", "getMimeType", "isLocalFilePreviewable", "resolveCopyNameExtension"],
  },
  {
    path: "local-api/git/source-control-model.mjs",
    exports: ["buildGitSourceControlSnapshot", "gitStatusLabelToLetter", "uniqueGitPaths"],
  },
  {
    path: "local-api/git/cloud-remote.mjs",
    exports: ["createWorkspaceCloudRemoteActions"],
  },
  {
    path: "local-api/workspace-config.mjs",
    exports: ["readPuppyoneWorkspaceConfig", "regeneratePuppyoneWorkspaceProjectId", "writePuppyoneWorkspaceConfig"],
  },
];

for (const boundary of requiredBoundaries) {
  const source = read(boundary.path);
  if (countLines(source) > 500) {
    errors.push(`${boundary.path} exceeds the 500-line focused-module budget`);
  }
  for (const exportName of boundary.exports) {
    if (!new RegExp(`export (?:async )?function ${exportName}\\b`).test(source)) {
      errors.push(`${boundary.path} must own the ${exportName} implementation`);
    }
  }
}

const retiredFacadeImplementations = [
  "function normalizeRelativePath",
  "function resolveExistingWorkspacePath",
  "function resolveWorkspacePath",
  "function loadFileFormatRegistry",
  "function buildGitSourceControlSnapshot",
  "async function configureWorkspaceCloudRemote",
  "async function removeWorkspaceGitRemote",
  "function normalizePuppyoneWorkspaceConfig",
  "const mimeTypeByExtension",
  "const GIT_RESOURCE_GROUPS",
  "const PUPPYONE_CONFIG_FILE",
];
for (const retiredImplementation of retiredFacadeImplementations) {
  if (workspaceFacade.includes(retiredImplementation)) {
    errors.push(`local-api/workspace.mjs reabsorbed ${retiredImplementation}`);
  }
}

for (const requiredImport of [
  'from "./files/file-format-policy.mjs"',
  'from "./files/path-policy.mjs"',
  'from "./git/source-control-model.mjs"',
  'from "./git/cloud-remote.mjs"',
  'from "./workspace-config.mjs"',
]) {
  if (!workspaceFacade.includes(requiredImport)) {
    errors.push(`local-api/workspace.mjs must delegate through ${requiredImport}`);
  }
}

const localApiFiles = [
  "local-api/workspace.mjs",
  ...requiredBoundaries.map(({ path: boundaryPath }) => boundaryPath),
];
for (const relativePath of localApiFiles) {
  const source = read(relativePath);
  if (/from\s+["'](?:\.\.\/)+(?:src|electron)\//.test(source)) {
    errors.push(`${relativePath} must not depend on renderer or Electron host internals`);
  }
}

const formatPolicy = read("local-api/files/file-format-policy.mjs");
if (!formatPolicy.includes("packages/shared-ui/src/core/fileFormats.json")) {
  errors.push("the local file-format policy must consume the canonical Shared UI registry");
}

const contextualCloudData = read("src/features/cloud/data/useDesktopCloudData.ts");
const contextualCloudRouter = read("src/features/cloud/routes/CloudRouter.tsx");
const contextualCloudStates = read("src/features/cloud/states.tsx");
const contextualCloudResolver = read("src/features/cloud/workspace/useCloudWorkspaceBinding.ts");
const contextualCloudAttachment = read("src/features/cloud/attachment/useProjectCloudAttachment.ts");
const contextualWorkspaceSurface = read("src/features/app-shell/workspace-surfaces/useWorkspaceSurfaceContent.tsx");
const desktopApp = read("src/App.tsx");

if (contextualCloudData.includes("listCloudProjects")) {
  errors.push("contextual Cloud data must never enumerate the Organization Project catalog");
}
if (contextualCloudRouter.includes("CloudProjectBrowser")) {
  errors.push("the Local workspace Cloud router must not render the global Project browser");
}
for (const forbiddenLocalOnlyToken of ["CloudProjectRow", "onCopyCloneCommand"]) {
  if (contextualCloudStates.includes(forbiddenLocalOnlyToken)) {
    errors.push(`the Local-only Cloud state reintroduced ${forbiddenLocalOnlyToken}`);
  }
}
if (!contextualCloudResolver.includes("resolveCanonicalCloudWorkspaceRemote")) {
  errors.push("the Local workspace resolver must authorize canonical Git locators through the backend");
}
if (
  !contextualCloudResolver.includes("createWorkspaceCloudResolutionKey")
  || !contextualCloudAttachment.includes("createWorkspaceCloudResolutionKey")
  || !contextualCloudAttachment.includes("resolutionKey === expectedResolutionKey")
) {
  errors.push("contextual Cloud results must be keyed to the active workspace/account/host/locator snapshot");
}
if (contextualCloudResolver.includes("setHomeCloudProjects")) {
  errors.push("contextual Project resolution must not mutate the global/home Project catalog");
}
for (const obsoleteSelectionToken of [
  "selectedProjectId",
  "selectedProjectCapabilities",
  "onBackToCloudProjects",
]) {
  if (contextualWorkspaceSurface.includes(obsoleteSelectionToken) || desktopApp.includes(obsoleteSelectionToken)) {
    errors.push(`Local workspace composition reintroduced transient catalog state: ${obsoleteSelectionToken}`);
  }
}
if (desktopApp.includes("browseProjectCatalogOnCloudEntry")) {
  errors.push("entering Cloud from a Local workspace must not trigger catalog browsing");
}

if (errors.length > 0) {
  console.error("Local Workspace architecture check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Local Workspace architecture check passed.");

function read(relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), "utf8");
  } catch (error) {
    errors.push(`required architecture file is missing: ${relativePath} (${error.message})`);
    return "";
  }
}

function countLines(source) {
  return source === "" ? 0 : source.split(/\r?\n/).length;
}
