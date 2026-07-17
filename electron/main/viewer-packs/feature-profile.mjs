export const EXTERNAL_VIEWER_PACKS_CAPABILITY = "externalViewerPacks";
export const EXTERNAL_VIEWER_PACKS_DEV_ENV = "PUPPYONE_ENABLE_EXTERNAL_VIEWER_PACKS";
export const EXTERNAL_VIEWER_PACKS_RENDERER_ARGUMENT = "--puppyone-external-viewer-packs=1";

/**
 * Product capability resolution is main-process authority. Packaged builds
 * trust only signed package metadata; an environment override is available to
 * unpackaged development and release preflight, never to installed builds.
 */
export function resolveViewerPackFeatureProfile({
  packageMetadata = {},
  environment = {},
  isPackaged = false,
} = {}) {
  const metadataEnabled = resolvePackagedExternalViewerPacksCapability(packageMetadata);
  const developmentOverride = !isPackaged && environment?.[EXTERNAL_VIEWER_PACKS_DEV_ENV] === "1";
  const enabled = metadataEnabled || developmentOverride;

  return Object.freeze({
    id: enabled ? "external-viewer-packs" : "preset-viewers-only",
    externalViewerPacks: enabled,
    rendererArguments: Object.freeze(enabled ? [EXTERNAL_VIEWER_PACKS_RENDERER_ARGUMENT] : []),
  });
}

/**
 * Source package metadata is the only distributable profile authority. Builder
 * `extraMetadata` is forbidden from silently changing the effective capability
 * after release preflight has inspected package.json.
 */
export function resolvePackagedExternalViewerPacksCapability(packageMetadata = {}) {
  const sourceValue = packageMetadata?.puppyoneCapabilities?.[EXTERNAL_VIEWER_PACKS_CAPABILITY];
  if (sourceValue !== undefined && typeof sourceValue !== "boolean") {
    throw new TypeError("puppyoneCapabilities.externalViewerPacks must be boolean when present.");
  }
  const overrideValue = packageMetadata?.build?.extraMetadata
    ?.puppyoneCapabilities?.[EXTERNAL_VIEWER_PACKS_CAPABILITY];
  if (overrideValue !== undefined && typeof overrideValue !== "boolean") {
    throw new TypeError("build.extraMetadata externalViewerPacks override must be boolean when present.");
  }
  if (overrideValue !== undefined && overrideValue !== sourceValue) {
    throw new Error(
      "Electron builder extraMetadata cannot override the external Viewer Pack release capability.",
    );
  }
  return sourceValue === true;
}
