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
  const metadataEnabled = packageMetadata?.puppyoneCapabilities?.[EXTERNAL_VIEWER_PACKS_CAPABILITY] === true;
  const developmentOverride = !isPackaged && environment?.[EXTERNAL_VIEWER_PACKS_DEV_ENV] === "1";
  const enabled = metadataEnabled || developmentOverride;

  return Object.freeze({
    id: enabled ? "external-viewer-packs" : "preset-viewers-only",
    externalViewerPacks: enabled,
    rendererArguments: Object.freeze(enabled ? [EXTERNAL_VIEWER_PACKS_RENDERER_ARGUMENT] : []),
  });
}
