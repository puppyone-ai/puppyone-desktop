export function evaluateViewerPackReleaseTrust({
  externalViewerPacks,
  trustedSigners,
}) {
  if (!externalViewerPacks) {
    return Object.freeze({ status: "skipped", signerCount: 0 });
  }
  const signerCount = Array.isArray(trustedSigners) ? trustedSigners.length : 0;
  if (signerCount === 0) {
    throw new Error(
      "Viewer Pack release check failed: add at least one reviewed production public signer " +
      "before packaging an external-viewer-packs release.",
    );
  }
  return Object.freeze({ status: "passed", signerCount });
}
