import {
  PLUGIN_PROTOCOL_SCHEME,
  RESOURCE_PROTOCOL_SCHEME,
} from "./protocol-schemes.mjs";

export function getViewerPackPrivilegedSchemes(enabled) {
  if (!enabled) return Object.freeze([]);
  return Object.freeze([
    Object.freeze({
      scheme: PLUGIN_PROTOCOL_SCHEME,
      privileges: Object.freeze({
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        stream: true,
      }),
    }),
    Object.freeze({
      scheme: RESOURCE_PROTOCOL_SCHEME,
      privileges: Object.freeze({
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        stream: true,
      }),
    }),
  ]);
}

/**
 * Keeps the entire external Viewer Pack runtime outside the default startup
 * graph. The importer is injectable so the default-off boundary can be proven
 * without booting Electron.
 */
export async function loadViewerPackRuntime(
  enabled,
  importer = () => import("./index.mjs"),
) {
  if (!enabled) return null;
  const runtime = await importer();
  for (const name of [
    "createViewerPackHost",
    "registerViewerPackAppIpcHandlers",
    "registerViewerPackPluginIpcHandlers",
  ]) {
    if (typeof runtime?.[name] !== "function") {
      throw new TypeError(`Viewer Pack runtime is missing ${name}.`);
    }
  }
  return runtime;
}
