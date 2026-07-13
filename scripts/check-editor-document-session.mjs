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
  path.join(repoRoot, "src/features/puppyflow/PuppyFlowEditor.tsx"),
];
for (const filePath of contributionFiles) {
  const source = readFileSync(filePath, "utf8");
  for (const [pattern, reason] of [
    [/\bDocumentPersistencePort\b/, "imports the storage adapter contract"],
    [/\bdocumentPersistence\b/, "receives a storage adapter"],
    [/\bonSaveContent\b/, "owns the legacy save callback"],
    [/\b(?:window\.)?setTimeout\s*\([^)]*(?:save|persist|write)/is, "owns a save timer"],
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

const externalAdapterPath = path.join(sharedEditorRoot, "viewerHostAdapters.ts");
const externalAdapterSource = readFileSync(externalAdapterPath, "utf8");
for (const authority of ["EditorDocumentSession", "DocumentPersistencePort", "documentSession", "persistence"]) {
  if (new RegExp(`\\b${authority}\\b`).test(externalAdapterSource)) {
    errors.push(`${relative(externalAdapterPath)} exposes ${authority} to an external Viewer Pack`);
  }
}

const packTypesPath = path.join(sharedEditorRoot, "viewerPackTypes.ts");
const packTypesSource = readFileSync(packTypesPath, "utf8");
if (!/export type ViewerPackFormatContribution\s*=\s*\{[\s\S]*?editable:\s*false;[\s\S]*?\};/.test(packTypesSource)) {
  errors.push(`${relative(packTypesPath)} no longer fixes Viewer Pack v1 contributions to editable: false`);
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
