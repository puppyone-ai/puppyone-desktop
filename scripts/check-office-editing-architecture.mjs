#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const requirePattern = (relativePath, pattern, message) => {
  if (!pattern.test(read(relativePath))) errors.push(`${relativePath} ${message}`);
};

const manifest = JSON.parse(read("packages/shared-ui/src/editor/presetViewerManifest.json"));
const officeViewer = manifest.viewers.find(({ id }) => id === "office-preview");
if (officeViewer?.capability !== "edit" || officeViewer?.source !== "resource" || officeViewer?.runtime !== "lazy") {
  errors.push("Office must remain one lazy, resource-backed editable preset contribution.");
}

requirePattern(
  "packages/shared-ui/src/core/types.ts",
  /export type OfficeEditingPort\s*=\s*\{[\s\S]*?getAvailability:[\s\S]*?createSession:[\s\S]*?attachSurface:[\s\S]*?setSurfaceBounds:[\s\S]*?detachSurface:[\s\S]*?forceSave:[\s\S]*?closeSession:[\s\S]*?resolveConflict:[\s\S]*?subscribe:/,
  "does not expose the complete process-neutral OfficeEditingPort",
);
requirePattern(
  "packages/shared-ui/src/editor/PuppyoneEditorHost.tsx",
  /canEdit && documentPersistence && viewer\.source !== "resource"/,
  "routes resource editors through the text DocumentSession boundary",
);
requirePattern(
  "src/lib/localFiles.ts",
  /officeEditing:\s*\{[\s\S]*?createOfficeEditingSession[\s\S]*?resolveOfficeEditingConflict[\s\S]*?onOfficeEditingState/,
  "does not adapt the native bridge to OfficeEditingPort",
);
requirePattern(
  "electron/main.mjs",
  /createOfficeEditingSurfaceManager[\s\S]*?createOfficeEditingService[\s\S]*?registerOfficeEditingIpcHandlers/,
  "does not compose the Office service behind trusted IPC",
);
requirePattern(
  "electron/preload.cjs",
  /office-editing:get-availability[\s\S]*?office-editing:create-session[\s\S]*?office-editing:surface-attach[\s\S]*?office-editing:state/,
  "does not expose the narrow Office preload bridge",
);
requirePattern(
  "electron/main/office/office-editing-service.mjs",
  /status !== 2 && status !== 6[\s\S]*?writeWorkspaceBinaryFile[\s\S]*?WORKSPACE_VERSION_CONFLICT[\s\S]*?recoveryPath/,
  "does not preserve ONLYOFFICE final/force saves with optimistic conflict recovery",
);
requirePattern(
  "electron/main/office/office-editing-service.mjs",
  /\/command\?shardkey=[\s\S]*?verifyCallbackAuthorization\(authorization, body\)[\s\S]*?filetype[\s\S]*?Office result format does not match/,
  "does not use the current command endpoint or authenticate and format-bind callbacks",
);
requirePattern(
  "local-api/workspace.mjs",
  /writeWorkspaceTextFile[\s\S]*?serializeWorkspaceWrite[\s\S]*?writeWorkspaceBinaryFile[\s\S]*?serializeWorkspaceWrite/,
  "does not share one serialized atomic writer across text and binary saves",
);

const sharedUiSources = [
  "packages/shared-ui/src/core/types.ts",
  "packages/shared-ui/src/editor/viewers/OfficeEditorViewer.tsx",
  "packages/shared-ui/src/editor/viewers/OfficeViewer.tsx",
].map(read).join("\n");
if (/from\s+["'][^"']*(?:electron|src\/lib\/localFiles|node:fs)/.test(sharedUiSources)) {
  errors.push("Shared UI Office code imports a Host or filesystem implementation.");
}
if (/PUPPYONE_OFFICE_JWT_SECRET/.test(sharedUiSources)) {
  errors.push("Shared UI Office code can see the engine JWT secret.");
}
if (/DocsAPI|createElement\(["']script["']\)/.test(sharedUiSources)) {
  errors.push("Shared UI loads third-party Office code inside the trusted renderer.");
}
requirePattern(
  "electron/main/office/office-editing-surface.mjs",
  /WebContentsView[\s\S]*?sandbox:\s*true[\s\S]*?contextIsolation:\s*true[\s\S]*?nodeIntegration:\s*false[\s\S]*?webviewTag:\s*false/,
  "does not isolate the Office engine in a sandboxed native child surface",
);
requirePattern(
  "vite.config.ts",
  /script-src 'self'/,
  "weakens the trusted renderer CSP for the Office engine",
);

if (errors.length > 0) {
  console.error("Office editing architecture check failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Office editing architecture boundary check passed.");
