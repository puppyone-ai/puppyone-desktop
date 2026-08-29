#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const packageMetadata = JSON.parse(read("package.json"));
if (packageMetadata.puppyoneCapabilities?.gitAutoCommit !== false) {
  errors.push("the release capability must remain explicitly off by default");
}

const mainSource = read("electron/main.mjs");
const serviceSource = read("electron/main/git-auto-commit/service.mjs");
const kernelSource = read("local-api/git/auto-commit.mjs");
const preferenceSource = read("electron/main/git-auto-commit/preference-store.mjs");
const preloadSource = read("electron/preload.cjs");
const settingsSource = read("src/features/settings/main/RepositorySettingsViews.tsx");

for (const [snippet, message] of [
  ["gitAutoCommitFeatureProfile.rendererArguments", "Main must issue the renderer capability argument"],
  ["createGitAutoCommitService", "Main must own the autonomous service"],
  ["powerMonitor.on(\"resume\", gitAutoCommitService.reconcileAfterResume)", "the scheduler must reconcile after system resume"],
  ["gitAutoCommitService.reconcileWindow(webContentsId)", "window focus must reconcile potentially missed workspace activity"],
]) {
  if (!mainSource.includes(snippet)) errors.push(message);
}

for (const [snippet, message] of [
  ["documentDurabilityCoordinator.requestFlush", "the service must drain renderer document sessions before Git"],
  ["workspaceMutationTracker.whenIdle", "the service must drain Main-owned workspace writes before Git"],
  ["gitOperationCoordinator.tryRunAll", "autonomous work must use low-priority multi-domain Git ownership"],
  ["operationLease.acquire", "autonomous work must acquire cross-process repository ownership"],
  ["recoverTransaction", "the service must recover durable transactions"],
  ["isExecutionAllowed", "the service must recheck consent before ref mutation"],
]) {
  if (!serviceSource.includes(snippet)) errors.push(message);
}

for (const [snippet, message] of [
  ["temporaryIndexPath", "the Git kernel must construct commits in an isolated index"],
  ["Puppyone-Auto-Commit:", "automatic commits must carry a durable operation identity trailer"],
  ["reconcileRealIndex", "the Git kernel must reconcile only its exact candidate paths"],
  ["sensitive-candidate", "the Git kernel must fail closed on sensitive paths"],
  ["user-staged-changes", "the Git kernel must preserve pre-existing user staging"],
]) {
  if (!kernelSource.includes(snippet)) errors.push(message);
}
if (/\[\s*["'](?:push|pull|fetch|checkout|switch|reset)["']/.test(kernelSource)) {
  errors.push("the Auto Commit Git kernel must not perform network, branch, or reset operations");
}
if (/git\s+add\s+(?:-A|--all)|\[\s*["']add["']\s*,\s*["'](?:-A|--all)["']/.test(kernelSource)) {
  errors.push("the Auto Commit Git kernel must never stage the whole worktree");
}

for (const snippet of [
  "experimentalOptIn: false",
  "enabled: value?.enabled === true",
  "GIT_AUTO_COMMIT_MIN_INTERVAL_MS",
]) {
  if (!preferenceSource.includes(snippet)) {
    errors.push(`the authoritative preference store is missing ${snippet}`);
  }
}

if (!preloadSource.includes("...(gitAutoCommitAvailable ?")) {
  errors.push("the preload bridge must be absent when the release capability is unavailable");
}
if (!settingsSource.includes("window.confirm") || !settingsSource.includes("localOnly")) {
  errors.push("workspace activation must require explicit confirmation and disclose local-only behavior");
}
for (const forbidden of ["setInterval(", "child_process", "execGit(", "workspace:git-commit"]) {
  if (settingsSource.includes(forbidden)) {
    errors.push(`renderer Git Auto Commit settings must not own scheduling or Git execution (${forbidden})`);
  }
}

if (errors.length > 0) {
  console.error("Git Auto Commit architecture check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Git Auto Commit architecture check passed.");
