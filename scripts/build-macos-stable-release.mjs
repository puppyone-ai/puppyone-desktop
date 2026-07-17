#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyMacReleaseArtifacts, runCommand } from "./release-support/macos-release-artifacts.mjs";
import { assertMacReleaseReadiness } from "./release-support/macos-release-policy.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(repoRoot, "release");
const packageMetadata = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));

try {
  assertMacReleaseReadiness({ packageMetadata, env: process.env, platform: process.platform });
  await fs.rm(releaseDirectory, { recursive: true, force: true });
  for (const script of ["check:shared-ui", "build", "check:viewer-pack-trust", "check:opencode-release"]) {
    await runCommand("npm", ["run", script], { cwd: repoRoot });
  }
  await runCommand(path.join(repoRoot, "node_modules/.bin/electron-builder"), [
    "--mac",
    "--publish",
    "never",
  ], { cwd: repoRoot });
  const artifacts = await verifyMacReleaseArtifacts(releaseDirectory);
  console.log(`Stable macOS release verified: ${artifacts.apps.length} app bundle(s), ${artifacts.dmgs.length} DMG(s), ${artifacts.zips.length} ZIP(s).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
