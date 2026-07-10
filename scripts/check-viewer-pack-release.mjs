#!/usr/bin/env node

import { VIEWER_PACK_TRUSTED_SIGNERS } from "../electron/main/viewer-packs/trusted-signers.mjs";
import { normalizeTrustedSigners } from "../electron/main/viewer-packs/package-signature.mjs";

const signers = normalizeTrustedSigners(VIEWER_PACK_TRUSTED_SIGNERS);
if (signers.length === 0) {
  console.error(
    "Viewer Pack release check failed: add at least one reviewed production public signer " +
    "to electron/main/viewer-packs/trusted-signers.mjs before packaging a distributable build.",
  );
  process.exit(1);
}

console.log(`Viewer Pack release trust check passed (${signers.length} signer(s)).`);
