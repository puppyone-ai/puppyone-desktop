#!/usr/bin/env node

import { createRequire } from "node:module";
import { resolveViewerPackFeatureProfile } from "../electron/main/viewer-packs/feature-profile.mjs";
import { VIEWER_PACK_TRUSTED_SIGNERS } from "../electron/main/viewer-packs/trusted-signers.mjs";
import { normalizeTrustedSigners } from "../electron/main/viewer-packs/package-signature.mjs";

const require = createRequire(import.meta.url);
const packageMetadata = require("../package.json");
const profile = resolveViewerPackFeatureProfile({
  packageMetadata,
  environment: process.env,
  isPackaged: false,
});

if (!profile.externalViewerPacks) {
  console.log("Viewer Pack release trust check skipped (preset-viewers-only profile).");
  process.exit(0);
}

const signers = normalizeTrustedSigners(VIEWER_PACK_TRUSTED_SIGNERS);
if (signers.length === 0) {
  console.error(
    "Viewer Pack release check failed: add at least one reviewed production public signer " +
    "to electron/main/viewer-packs/trusted-signers.mjs before packaging a distributable build.",
  );
  process.exit(1);
}

console.log(`Viewer Pack release trust check passed (${signers.length} signer(s)).`);
