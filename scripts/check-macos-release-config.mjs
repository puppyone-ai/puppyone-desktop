#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
if (!scripts["dist:mac"]?.includes("-c.mac.identity=null")) {
  errors.push("the internal macOS build must explicitly disable signing through a command-local override");
}
if (!scripts["dist:mac"]?.includes("-c.mac.notarize=false")) {
  errors.push("the internal macOS build must explicitly disable notarization through a command-local override");
}
if (scripts["dist:mac:publish"] !== "npm run dist:mac:release && npm run publish:mac:r2") {
  errors.push("stable publishing must verify the signed release before the explicit R2 upload step");
}

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
