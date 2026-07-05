import {
  getApplicationDisplayName,
  resolveApplicationBundleId,
  validateExternalApplicationPath,
} from "./bundle-metadata.mjs";
import { getApplicationIconDataUrl } from "./icon-service.mjs";

export async function getExternalApplicationInfo({ app, appPath }) {
  const normalizedPath = validateExternalApplicationPath(appPath);
  const iconDataUrl = await getApplicationIconDataUrl(app, normalizedPath);
  return {
    appName: getApplicationDisplayName(normalizedPath),
    appPath: normalizedPath,
    bundleId: resolveApplicationBundleId(normalizedPath),
    iconDataUrl,
  };
}

export function createUnknownExternalOpenTarget(extension) {
  return {
    appName: null,
    appPath: null,
    bundleId: null,
    extension,
    iconDataUrl: null,
    source: "unknown",
  };
}
