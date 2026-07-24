const PINNED_ACTION_PATTERN = /uses:\s+actions\/[A-Za-z0-9_.-]+@[a-f0-9]{40}(?:\s+#.*)?$/gm;
const UNPINNED_ACTION_PATTERN = /uses:\s+actions\/[A-Za-z0-9_.-]+@(?![a-f0-9]{40}(?:\s|$))[^ \n]+/g;

export function inspectInternalReleaseWorkflow(workflowSource) {
  const errors = inspectSource(workflowSource, "internal release workflow");
  if (errors.length > 0) return errors;
  requireSnippets(workflowSource, errors, [
    ["runs-on: macos-15", "the internal build must use the pinned arm64 macOS runner"],
    ["publish_release:", "the internal workflow must expose one atomic publish switch"],
    ["Test release transaction and Terminal launcher", "the internal build must run release integration tests on macOS"],
    ["Create self-describing release bundle", "the internal build must create release metadata"],
    ["actions/attest@", "published internal binaries must receive build provenance"],
    ["uses: ./.github/workflows/desktop-release-publish.yml", "the internal workflow must use the canonical publisher"],
    ["deployment_environment: desktop-internal", "the internal publisher must use its deployment environment"],
    ["r2-prefix \"desktop/internal/mac/${RELEASE_TAG}\"", "the internal manifest must use the internal R2 channel"],
  ]);
  forbidSnippets(workflowSource, errors, [
    ["upload_r2:", "R2 and GitHub publication must not be independently selectable"],
    ["create_github_release:", "R2 and GitHub publication must not be independently selectable"],
    ["R2_ACCESS_KEY_ID", "the build job must not receive R2 deployment credentials"],
    ["desktop/stable/mac", "the ad-hoc internal workflow must never write to the stable channel"],
  ]);
  inspectPinnedActions(workflowSource, errors);
  return errors;
}

export function inspectStableReleaseWorkflow(workflowSource) {
  const errors = inspectSource(workflowSource, "stable release workflow");
  if (errors.length > 0) return errors;
  requireSnippets(workflowSource, errors, [
    ["runs-on: macos-15", "the stable build must pin its macOS runner"],
    ["name: desktop-signing", "stable signing must use its dedicated deployment environment"],
    ["Test release transaction and Terminal launcher", "the stable build must run release integration tests on macOS"],
    ["Prepare release application without deployment secrets", "stable application preparation must be secretless"],
    ["Sign, notarize, and verify release package", "stable packaging must sign and notarize"],
    ["Create self-describing stable release bundle", "the stable build must create release metadata"],
    ["actions/attest@", "stable binaries must receive build provenance"],
    ["uses: ./.github/workflows/desktop-release-publish.yml", "stable releases must use the canonical publisher"],
    ["verify_tag: true", "stable GitHub releases must require a pre-existing tag"],
    ["generate_notes: true", "stable GitHub releases must generate release notes"],
  ]);
  forbidSnippets(workflowSource, errors, [
    ["R2_ACCESS_KEY_ID", "the stable build workflow must not receive R2 deployment credentials"],
    ["gh release create", "the stable build must delegate GitHub publication to the canonical publisher"],
  ]);
  assertOrder(workflowSource, errors, [
    "Install locked dependencies without deployment secrets",
    "Prepare release application without deployment secrets",
    "Sign, notarize, and verify release package",
    "Create self-describing stable release bundle",
    "Attest stable binaries and checksums",
    "Upload build-once stable release bundle",
  ], "stable build");
  inspectPinnedActions(workflowSource, errors);
  return errors;
}

export function inspectReleasePublisherWorkflow(workflowSource) {
  const errors = inspectSource(workflowSource, "release publisher workflow");
  if (errors.length > 0) return errors;
  requireSnippets(workflowSource, errors, [
    ["group: desktop-release-publish", "all release channels must share one publication lock"],
    ["name: ${{ inputs.deployment_environment }}", "publishing secrets must be environment-scoped"],
    ["Download build-once release bundle", "the publisher must consume the build-once artifact"],
    ["release.json is the commit marker", "R2 publication must use an explicit commit marker"],
    ["--cache-control \"public, max-age=31536000, immutable\"", "versioned release objects must be immutable"],
    ["--cache-control \"public, no-cache, must-revalidate\"", "mutable release objects must revalidate"],
    ["--draft", "GitHub releases must be created as drafts"],
    ["Verify GitHub asset digests before publication", "GitHub asset digests must be checked before publication"],
    ["Publish verified GitHub Release", "the publisher must explicitly publish the verified draft"],
    ["Verify every immutable R2 object by SHA-256", "every R2 versioned object must be content-verified"],
    ["Validate remote tag ownership", "an existing Git tag must resolve to the bundled commit"],
    ["Publish latest release pointer", "the latest channel must expose a machine-readable pointer"],
    ["desktop/catalog/releases.json", "the publisher must maintain the webpage release catalog"],
    ["Verify public pointers and catalog", "mutable public metadata must be verified after publication"],
    ["Clean stale mutable release files", "stale latest files must be removed only after the new release is public"],
  ]);
  forbidSnippets(workflowSource, errors, [
    ["--delete", "latest promotion must not delete working payloads before the new release is committed"],
    ["AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}\n      AWS_SECRET", "R2 credentials must not be job-global"],
  ]);
  assertOrder(workflowSource, errors, [
    "Validate release bundle and caller contract",
    "Inspect immutable R2 release state",
    "Upload immutable R2 release",
    "Verify every immutable R2 object by SHA-256",
    "Validate remote tag ownership",
    "Create GitHub draft release with identical assets",
    "Verify GitHub asset digests before publication",
    "Publish verified GitHub Release",
    "Promote mutable R2 latest files",
    "Verify mutable latest payloads by SHA-256",
    "Publish latest release pointer",
    "Merge immutable release into catalog",
    "Publish release catalog",
    "Verify public pointers and catalog",
    "Clean stale mutable release files",
  ], "canonical publication");
  inspectPinnedActions(workflowSource, errors);
  return errors;
}

export function inspectLegacyArchiveWorkflow(workflowSource) {
  const errors = inspectSource(workflowSource, "legacy archive workflow");
  if (errors.length > 0) return errors;
  requireSnippets(workflowSource, errors, [
    ["delete_root_objects:", "root deletion must require an explicit workflow input"],
    ["default: false", "root deletion must be disabled by default"],
    ["group: desktop-release-publish", "archive catalog updates must share the global publication lock"],
    ["name: desktop-internal", "archive credentials must use a deployment environment"],
    ["--provenance backfill", "GitHub-backed history must be marked as a backfill"],
    ["--provenance archive", "provenance-free root artifacts must be marked as archives"],
    ["Verify every backfilled R2 object by SHA-256", "all historical R2 copies must be content-verified"],
    ["Attach and verify metadata on historical GitHub Releases", "GitHub history must receive the same release metadata as R2"],
    ["Merge release history into catalog", "all historical releases must appear in the website catalog"],
    ["if: ${{ inputs.delete_root_objects }}", "root deletion must be explicitly gated"],
  ]);
  assertOrder(workflowSource, errors, [
    "Build verified bundles from canonical GitHub Releases",
    "Download original root objects",
    "Create honest legacy archive metadata",
    "Backfill immutable GitHub releases into R2",
    "Upload immutable legacy archives",
    "Verify every backfilled R2 object by SHA-256",
    "Attach and verify metadata on historical GitHub Releases",
    "Merge release history into catalog",
    "Publish and verify complete release catalog",
    "Delete verified root objects",
  ], "release history backfill");
  inspectPinnedActions(workflowSource, errors);
  return errors;
}

function inspectSource(source, label) {
  return typeof source === "string" && source.trim().length > 0 ? [] : [`the ${label} is missing or empty`];
}

function requireSnippets(source, errors, requirements) {
  for (const [snippet, error] of requirements) {
    if (!source.includes(snippet)) errors.push(error);
  }
}

function forbidSnippets(source, errors, requirements) {
  for (const [snippet, error] of requirements) {
    if (source.includes(snippet)) errors.push(error);
  }
}

function assertOrder(source, errors, stages, label) {
  let previousIndex = -1;
  for (const stage of stages) {
    const currentIndex = source.indexOf(`- name: ${stage}`);
    if (currentIndex < 0) {
      errors.push(`the ${label} is missing the "${stage}" stage`);
      continue;
    }
    if (currentIndex <= previousIndex) errors.push(`the ${label} must run "${stage}" after its preceding stage`);
    previousIndex = Math.max(previousIndex, currentIndex);
  }
}

function inspectPinnedActions(source, errors) {
  const unpinned = source.match(UNPINNED_ACTION_PATTERN) ?? [];
  if (unpinned.length > 0) errors.push(`GitHub-owned actions must be pinned to full commit SHAs: ${unpinned.join(", ")}`);
  if (source.includes("uses: actions/") && !(source.match(PINNED_ACTION_PATTERN) ?? []).length) {
    errors.push("the workflow does not contain a verifiably pinned GitHub-owned action");
  }
}
