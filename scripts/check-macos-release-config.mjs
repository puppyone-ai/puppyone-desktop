#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectInternalReleaseWorkflow,
  inspectLegacyArchiveWorkflow,
  inspectReleasePublisherWorkflow,
  inspectStableReleaseWorkflow,
} from "./release-support/internal-release-workflow-policy.mjs";
import { inspectMacReleaseReadiness } from "./release-support/macos-release-policy.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const packageMetadata = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const errors = inspectMacReleaseReadiness({
  packageMetadata,
  platform: "darwin",
  env: {
    CSC_LINK: "configured-by-ci",
    CSC_KEY_PASSWORD: "configured-by-ci",
    APPLE_API_KEY: "configured-by-ci",
    APPLE_API_KEY_ID: "configured-by-ci",
    APPLE_API_ISSUER: "configured-by-ci",
  },
});

const scripts = packageMetadata.scripts ?? {};
if (!scripts["dist:mac"]?.includes("-c.mac.identity=-")) {
  errors.push("the internal macOS build must explicitly use ad-hoc signing through a command-local override");
}
if (!scripts["dist:mac"]?.includes("-c.mac.notarize=false")) {
  errors.push("the internal macOS build must explicitly disable notarization through a command-local override");
}
if (scripts["publish:mac:r2"] || scripts["dist:mac:publish"]) {
  errors.push("stable R2 publishing must only happen through the canonical GitHub Release workflow");
}
if (
  scripts["prepare:mac:release"] !== "npm run check:shared-ui && npm run build && npm run check:viewer-pack-trust && npm run check:opencode-release"
  || scripts["package:mac:release"] !== "node scripts/build-macos-stable-release.mjs --package-only"
) {
  errors.push("stable CI must prepare without deployment secrets before entering the signing step");
}

const internalWorkflow = readFileSync(
  path.join(repoRoot, ".github", "workflows", "desktop-internal-build.yml"),
  "utf8",
);
errors.push(...inspectInternalReleaseWorkflow(internalWorkflow));
const stableWorkflow = readFileSync(
  path.join(repoRoot, ".github", "workflows", "desktop-stable-release.yml"),
  "utf8",
);
errors.push(...inspectStableReleaseWorkflow(stableWorkflow));
const publisherWorkflow = readFileSync(
  path.join(repoRoot, ".github", "workflows", "desktop-release-publish.yml"),
  "utf8",
);
errors.push(...inspectReleasePublisherWorkflow(publisherWorkflow));
const archiveWorkflow = readFileSync(
  path.join(repoRoot, ".github", "workflows", "desktop-legacy-archive.yml"),
  "utf8",
);
errors.push(...inspectLegacyArchiveWorkflow(archiveWorkflow));

try {
  const { validateConfiguration } = require("app-builder-lib/out/util/config/config.js");
  await validateConfiguration(packageMetadata.build, { isEnabled: false, add() {} });
} catch (error) {
  errors.push(`electron-builder rejected the production configuration: ${error.message}`);
}

if (errors.length > 0) {
  console.error("macOS release configuration check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("macOS release configuration check passed.");
