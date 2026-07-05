import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { nativeImage } from "electron";
import { readApplicationInfoPlist } from "./bundle-metadata.mjs";

const APPLICATION_ICON_SIZE = 32;

const applicationIconDataUrlCache = new Map();

export async function getApplicationIconDataUrl(app, appPath) {
  const cachedIconDataUrl = applicationIconDataUrlCache.get(appPath);
  if (cachedIconDataUrl !== undefined) return cachedIconDataUrl;

  const bundleIconDataUrl = getApplicationBundleIconDataUrl(appPath);
  if (bundleIconDataUrl) {
    applicationIconDataUrlCache.set(appPath, bundleIconDataUrl);
    return bundleIconDataUrl;
  }

  try {
    const icon = await app.getFileIcon(appPath, { size: "normal" });
    const iconDataUrl = nativeImageToDataUrl(icon);
    applicationIconDataUrlCache.set(appPath, iconDataUrl);
    return iconDataUrl;
  } catch {
    applicationIconDataUrlCache.set(appPath, null);
    return null;
  }
}

function getApplicationBundleIconDataUrl(appPath) {
  if (process.platform !== "darwin") return null;

  for (const iconPath of getApplicationBundleIconPaths(appPath)) {
    const dataUrl = path.extname(iconPath).toLowerCase() === ".icns"
      ? convertIcnsIconToDataUrl(iconPath)
      : nativeImageToDataUrl(nativeImage.createFromPath(iconPath));
    if (dataUrl) return dataUrl;
  }

  return null;
}

function convertIcnsIconToDataUrl(iconPath) {
  const nativeDataUrl = nativeImageToDataUrl(nativeImage.createFromPath(iconPath));
  if (nativeDataUrl) return nativeDataUrl;

  return convertIcnsIconsetToDataUrl(iconPath) ?? convertIcnsIconWithSipsToDataUrl(iconPath);
}

function convertIcnsIconsetToDataUrl(iconPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "puppyone-app-icon-"));
  const iconsetPath = path.join(tempDir, "icon.iconset");
  try {
    const result = spawnSync("/usr/bin/iconutil", ["-c", "iconset", iconPath, "-o", iconsetPath], {
      encoding: "utf8",
      timeout: 2500,
      maxBuffer: 64 * 1024,
    });
    if (result.error || result.status !== 0 || !fs.existsSync(iconsetPath)) return null;

    const images = fs.readdirSync(iconsetPath)
      .filter((entryName) => path.extname(entryName).toLowerCase() === ".png")
      .map((entryName) => {
        const image = nativeImage.createFromPath(path.join(iconsetPath, entryName));
        const size = image.getSize();
        return { image, area: size.width * size.height };
      })
      .filter(({ image, area }) => area > 0 && !image.isEmpty())
      .sort((a, b) => b.area - a.area);

    for (const { image } of images) {
      const dataUrl = nativeImageToDataUrl(image);
      if (dataUrl) return dataUrl;
    }
    return null;
  } catch {
    return null;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function convertIcnsIconWithSipsToDataUrl(iconPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "puppyone-app-icon-"));
  const outputPath = path.join(tempDir, "icon.png");
  try {
    const result = spawnSync("/usr/bin/sips", ["-s", "format", "png", iconPath, "--out", outputPath], {
      encoding: "utf8",
      timeout: 2500,
      maxBuffer: 64 * 1024,
    });
    if (result.error || result.status !== 0 || !fs.existsSync(outputPath)) return null;

    return nativeImageToDataUrl(nativeImage.createFromPath(outputPath));
  } catch {
    return null;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function getApplicationBundleIconPaths(appPath) {
  const info = readApplicationInfoPlist(appPath);
  if (!info) return [];

  const resourcesPath = path.join(appPath, "Contents", "Resources");
  const candidates = [];
  collectBundleIconCandidatePaths(candidates, resourcesPath, info.CFBundleIconFile);
  collectBundleIconCandidatePaths(candidates, resourcesPath, info.CFBundleIconName);

  const seenPaths = new Set();
  return candidates.filter((candidatePath) => {
    const normalizedPath = path.resolve(candidatePath);
    if (seenPaths.has(normalizedPath)) return false;
    seenPaths.add(normalizedPath);
    return fs.existsSync(normalizedPath);
  });
}

function collectBundleIconCandidatePaths(candidates, resourcesPath, iconName) {
  if (typeof iconName !== "string" || !iconName.trim()) return;

  const trimmedName = iconName.trim();
  if (path.extname(trimmedName)) {
    candidates.push(path.join(resourcesPath, trimmedName));
    return;
  }

  candidates.push(path.join(resourcesPath, `${trimmedName}.icns`));
  candidates.push(path.join(resourcesPath, trimmedName));
}

function nativeImageToDataUrl(icon) {
  if (!icon || icon.isEmpty()) return null;
  const resizedIcon = icon.resize({ width: APPLICATION_ICON_SIZE, height: APPLICATION_ICON_SIZE });
  return resizedIcon.isEmpty() ? icon.toDataURL() : resizedIcon.toDataURL();
}
