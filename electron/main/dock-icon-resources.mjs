import fs from "node:fs";
import path from "node:path";

export const DOCK_ICON_RESOURCE_FILENAMES = Object.freeze({
  polished: "logo-square.png",
  light: "dock-icon-light.png",
  matte: "dock-icon-matte.png",
});

export const DEVELOPMENT_DOCK_ICON_RESOURCE_FILENAMES = Object.freeze({
  polished: "logo-square-dev.png",
  light: "dock-icon-light-dev.png",
  matte: "dock-icon-matte-dev.png",
});

const DOCK_ICON_SOURCE_FILENAMES = Object.freeze({
  polished: "logo-square.png",
  light: "logo-square-v0.1.3-light.png",
  matte: "logo-square-v0.1.3-dark.png",
});

const DEVELOPMENT_DOCK_ICON_SOURCE_FILENAMES = Object.freeze({
  polished: "logo-square-dev.png",
  light: "logo-square-v0.1.3-light-dev.png",
  matte: "logo-square-v0.1.3-dark-dev.png",
});

export function resolveDockIconResource({
  iconId,
  developmentBuild,
  resourcesPath,
  projectRoot,
  existsSync = fs.existsSync,
}) {
  const normalizedIconId = Object.hasOwn(DOCK_ICON_RESOURCE_FILENAMES, iconId)
    ? iconId
    : "polished";
  const resourceFilename = (developmentBuild
    ? DEVELOPMENT_DOCK_ICON_RESOURCE_FILENAMES
    : DOCK_ICON_RESOURCE_FILENAMES)[normalizedIconId];
  const sourceFilename = (developmentBuild
    ? DEVELOPMENT_DOCK_ICON_SOURCE_FILENAMES
    : DOCK_ICON_SOURCE_FILENAMES)[normalizedIconId];
  const candidates = [
    path.join(resourcesPath ?? projectRoot, resourceFilename),
    // Vite copies every renderer public asset into dist/. Unlike public/, dist/
    // is included inside app.asar in packaged builds, so this is a real
    // production fallback as well as a useful unpackaged-build fallback.
    path.join(projectRoot, "dist", sourceFilename),
    path.join(projectRoot, "public", sourceFilename),
  ];

  return Object.freeze({
    iconId: normalizedIconId,
    path: candidates.find((candidate) => existsSync(candidate)) ?? null,
  });
}
