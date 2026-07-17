#!/usr/bin/env node

import { createRequire } from "node:module";
import { resolveViewerPackFeatureProfile } from "../electron/main/viewer-packs/feature-profile.mjs";
import { VIEWER_PACK_TRUSTED_SIGNERS } from "../electron/main/viewer-packs/trusted-signers.mjs";
import { normalizeTrustedSigners } from "../electron/main/viewer-packs/package-signature.mjs";
import { evaluateViewerPackReleaseTrust } from "../electron/main/viewer-packs/release-policy.mjs";

const require = createRequire(import.meta.url);
const packageMetadata = require("../package.json");
const profile = resolveViewerPackFeatureProfile({
  packageMetadata,
  environment: {},
  isPackaged: true,
});
const signers = normalizeTrustedSigners(VIEWER_PACK_TRUSTED_SIGNERS);
let result;
try {
  result = evaluateViewerPackReleaseTrust({
    externalViewerPacks: profile.externalViewerPacks,
    trustedSigners: signers,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (result.status === "skipped") {
  console.log("Viewer Pack release trust check skipped (preset-viewers-only profile).");
} else {
  console.log(`Viewer Pack release trust check passed (${result.signerCount} signer(s)).`);
}
