#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyMacReleaseArtifacts, runCommand } from "./release-support/macos-release-artifacts.mjs";
import { assertMacReleaseReadiness } from "./release-support/macos-release-policy.mjs";
import { prepareDesktopBuild } from "./release-support/desktop-build-preparation.mjs";
import { verifyPackagedDesktopBuild } from "./release-support/packaged-desktop-build-verifier.mjs";
import {
  assertDesktopBuildInfo,
  createDesktopBuildTag,
} from "../shared/desktop-build-identity.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(repoRoot, "release");
const buildInfoPath = path.join(repoRoot, "generated", "desktop-build-info.json");
const builderConfigPath = path.join(repoRoot, "generated", "electron-builder.json");
const packageMetadata = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
const packageOnly = process.argv.includes("--package-only");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--package-only");

try {
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown stable release arguments: ${unknownArguments.join(", ")}`);
  }
  if (!packageOnly) {
    await prepareDesktopBuild({
      repositoryRoot: repoRoot,
      channel: "stable",
      buildNumber: process.env.PUPPYONE_BUILD_NUMBER ?? process.env.GITHUB_RUN_NUMBER,
      commitSha: process.env.GITHUB_SHA,
      expectedTag: process.env.PUPPYONE_RELEASE_TAG ?? `v${packageMetadata.version}`,
    });
  }
  const builderConfig = JSON.parse(await fs.readFile(builderConfigPath, "utf8"));
  assertMacReleaseReadiness({
    packageMetadata,
    builderConfig,
    env: process.env,
    platform: process.platform,
  });
  if (!packageOnly) {
    await fs.rm(releaseDirectory, { recursive: true, force: true });
    for (const script of ["prepare:mac:release"]) {
      await runCommand("npm", ["run", script], { cwd: repoRoot });
    }
  }
  const buildInfo = assertDesktopBuildInfo(JSON.parse(await fs.readFile(buildInfoPath, "utf8")));
  if (buildInfo.channel !== "stable") {
    throw new Error(`Stable packaging requires stable Build Identity; received ${buildInfo.channel}.`);
  }
  if (createDesktopBuildTag(buildInfo) !== (process.env.PUPPYONE_RELEASE_TAG ?? `v${packageMetadata.version}`)) {
    throw new Error("Stable Build Identity does not match the release tag.");
  }
  await runCommand(path.join(repoRoot, "node_modules/.bin/electron-builder"), [
    "--config",
    builderConfigPath,
    "--mac",
    "--publish",
    "never",
  ], { cwd: repoRoot });
  const artifacts = await verifyMacReleaseArtifacts(releaseDirectory);
  await verifyPackagedDesktopBuild({ releaseDirectory, buildInfo });
  console.log(`Stable macOS release verified: ${artifacts.apps.length} app bundle(s), ${artifacts.dmgs.length} DMG(s), ${artifacts.zips.length} ZIP(s).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
