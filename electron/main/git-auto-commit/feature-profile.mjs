export const GIT_AUTO_COMMIT_CAPABILITY = "gitAutoCommit";
export const GIT_AUTO_COMMIT_DEV_ENV = "PUPPYONE_ENABLE_GIT_AUTO_COMMIT";
export const GIT_AUTO_COMMIT_RENDERER_ARGUMENT = "--puppyone-git-auto-commit=1";

/** Main-process release authority; installed builds ignore environment input. */
export function resolveGitAutoCommitFeatureProfile({
  packageMetadata = {},
  environment = {},
  isPackaged = false,
} = {}) {
  const metadataEnabled = resolvePackagedGitAutoCommitCapability(packageMetadata);
  const developmentOverride = !isPackaged && environment?.[GIT_AUTO_COMMIT_DEV_ENV] === "1";
  const available = metadataEnabled || developmentOverride;
  return Object.freeze({
    available,
    rendererArguments: Object.freeze(available ? [GIT_AUTO_COMMIT_RENDERER_ARGUMENT] : []),
  });
}

export function resolvePackagedGitAutoCommitCapability(packageMetadata = {}) {
  const sourceValue = packageMetadata?.puppyoneCapabilities?.[GIT_AUTO_COMMIT_CAPABILITY];
  if (sourceValue !== undefined && typeof sourceValue !== "boolean") {
    throw new TypeError("puppyoneCapabilities.gitAutoCommit must be boolean when present.");
  }
  const overrideValue = packageMetadata?.build?.extraMetadata
    ?.puppyoneCapabilities?.[GIT_AUTO_COMMIT_CAPABILITY];
  if (overrideValue !== undefined && typeof overrideValue !== "boolean") {
    throw new TypeError("build.extraMetadata gitAutoCommit override must be boolean when present.");
  }
  if (overrideValue !== undefined && overrideValue !== sourceValue) {
    throw new Error("Electron builder extraMetadata cannot override the Git Auto Commit release capability.");
  }
  return sourceValue === true;
}
