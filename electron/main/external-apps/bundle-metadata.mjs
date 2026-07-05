import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function validateExternalApplicationPath(appPath) {
  if (typeof appPath !== "string" || appPath.trim().length === 0) {
    throw new Error("Application path is required.");
  }
  const normalizedPath = path.resolve(appPath);
  if (path.extname(normalizedPath).toLowerCase() !== ".app") {
    throw new Error("External app must be a macOS application bundle.");
  }
  const stats = fs.statSync(normalizedPath, { throwIfNoEntry: false });
  if (!stats || !stats.isDirectory()) {
    throw new Error("External app could not be found.");
  }
  return normalizedPath;
}

export function readApplicationInfoPlist(appPath) {
  const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
  if (!fs.existsSync(infoPlistPath)) return null;

  const result = spawnSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", infoPlistPath], {
    encoding: "utf8",
    timeout: 800,
    maxBuffer: 512 * 1024,
  });
  if (result.error || result.status !== 0) return null;

  try {
    const info = JSON.parse(result.stdout);
    return info && typeof info === "object" ? info : null;
  } catch {
    return null;
  }
}

export function resolveApplicationBundleId(appPath) {
  if (process.platform !== "darwin") return null;

  const result = spawnSync("/usr/bin/mdls", ["-raw", "-name", "kMDItemCFBundleIdentifier", appPath], {
    encoding: "utf8",
    timeout: 2000,
  });
  if (result.error || result.status !== 0) return null;

  const value = result.stdout.trim();
  return value && value !== "(null)" ? value : null;
}

export function getApplicationDisplayName(appPath) {
  return path.basename(appPath, ".app") || "Default App";
}

export function readApplicationDisplayName(info, appPath) {
  for (const key of ["CFBundleDisplayName", "CFBundleName", "CFBundleExecutable"]) {
    if (typeof info[key] === "string" && info[key].trim()) return info[key].trim();
  }
  return getApplicationDisplayName(appPath);
}

export function normalizeExtension(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase().replace(/^\*?\./, "");
  return /^[a-z0-9][a-z0-9_-]{0,31}$/.test(normalized) ? normalized : "";
}

export function normalizeContentType(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function collectStringArray(value, output, normalize) {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = normalize(item);
    if (normalized) output.add(normalized);
  }
}
