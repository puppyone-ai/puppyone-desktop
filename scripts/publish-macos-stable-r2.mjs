#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyMacReleaseArtifacts, runCommand } from "./release-support/macos-release-artifacts.mjs";
import {
  assertMacReleaseReadiness,
  getStableReleaseCoordinates,
} from "./release-support/macos-release-policy.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(repoRoot, "release");
const packageMetadata = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));

try {
  assertMacReleaseReadiness({
    packageMetadata,
    env: process.env,
    platform: process.platform,
    requireUploadCredentials: true,
  });
  await verifyMacReleaseArtifacts(releaseDirectory);
  await runCommand("aws", ["--version"], { capture: true });

  const coordinates = getStableReleaseCoordinates({ packageMetadata, env: process.env });
  const syncFilters = [
    "--exclude", "*",
    "--include", "*.dmg",
    "--include", "*.zip",
    "--include", "*.yml",
    "--include", "*.blockmap",
  ];
  for (const prefix of [coordinates.versionPrefix, coordinates.latestPrefix]) {
    await runCommand("aws", [
      "s3",
      "sync",
      releaseDirectory,
      `s3://${coordinates.bucket}/${prefix}`,
      "--endpoint-url",
      coordinates.endpoint,
      ...syncFilters,
      ...(prefix === coordinates.latestPrefix ? ["--delete"] : []),
    ], { cwd: repoRoot });
  }
  console.log(`Published ${coordinates.tag} to R2 versioned and latest stable prefixes.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
