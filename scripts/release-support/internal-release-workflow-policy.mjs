const ORDERED_R2_STAGES = [
  "Upload immutable release to R2",
  "Verify immutable R2 release",
  "Create GitHub prerelease",
  "Promote R2 latest aliases",
  "Verify public R2 download contract",
];

const REQUIRED_SNIPPETS = [
  {
    value: "runs-on: macos-15",
    error: "the internal workflow must use the pinned arm64 macOS runner",
  },
  {
    value: "group: desktop-internal-r2-${{ inputs.r2_prefix }}",
    error: "the internal workflow must serialize releases that share an R2 prefix",
  },
  {
    value: "- name: Ensure immutable R2 prefix is unused",
    error: "the internal workflow must reject an existing versioned R2 prefix",
  },
  {
    value: '--cache-control "public, max-age=31536000, immutable"',
    error: "versioned internal release objects must use immutable cache headers",
  },
  {
    value: '--cache-control "public, no-cache, must-revalidate"',
    error: "mutable latest objects must require cache revalidation",
  },
  {
    value: "puppyone-terminal-preview-latest-${ARCH}.tgz",
    error: "the internal workflow must publish the Terminal launcher's stable latest URL",
  },
  {
    value: "The public latest Terminal package does not match this release.",
    error: "the internal workflow must verify the public latest package digest",
  },
];

export function inspectInternalReleaseWorkflow(workflowSource) {
  if (typeof workflowSource !== "string" || workflowSource.trim().length === 0) {
    return ["the internal release workflow is missing or empty"];
  }

  const errors = [];
  for (const requirement of REQUIRED_SNIPPETS) {
    if (!workflowSource.includes(requirement.value)) errors.push(requirement.error);
  }

  let previousIndex = -1;
  for (const stage of ORDERED_R2_STAGES) {
    const currentIndex = workflowSource.indexOf(`- name: ${stage}`);
    if (currentIndex < 0) {
      errors.push(`the internal workflow is missing the "${stage}" stage`);
      continue;
    }
    if (currentIndex <= previousIndex) {
      errors.push(`the internal workflow must run "${stage}" after the preceding release stage`);
    }
    previousIndex = Math.max(previousIndex, currentIndex);
  }

  const promoteStart = workflowSource.indexOf("- name: Promote R2 latest aliases");
  const verifyStart = workflowSource.indexOf("- name: Verify public R2 download contract");
  const promoteSource = workflowSource.slice(promoteStart, verifyStart);
  const aliasUpload = promoteSource.indexOf("puppyone-latest-${ARCH}.${ext}");
  const launcherUpload = promoteSource.indexOf("puppyone-terminal-preview-latest-${ARCH}.tgz");
  if (aliasUpload < 0 || launcherUpload <= aliasUpload) {
    errors.push("the mutable Terminal launcher must be promoted after the latest app aliases");
  }

  if (workflowSource.includes("desktop/stable/mac")) {
    errors.push("the ad-hoc internal workflow must never write to the stable R2 channel");
  }

  return errors;
}
