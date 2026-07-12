import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_PATH_DIRECTORIES = 48;
const MAX_NAMES = 8;
const MAX_CANDIDATES = 128;

/**
 * Resolve one executable from a deterministic, non-login-shell candidate set.
 * The returned path is the canonical path, so a later symlink swap cannot
 * redirect the process launch.
 */
export async function resolveFirstExecutable({
  names,
  configuredPaths = [],
  env = process.env,
  homedir = os.homedir(),
  platform = process.platform,
  fsModule = fs,
} = {}) {
  const descriptors = normalizeNames(names, platform);
  if (descriptors.length === 0) return null;
  const candidates = buildCandidates({
    descriptors,
    configuredPaths,
    env,
    homedir,
    platform,
  });

  for (const candidate of candidates) {
    const validated = await validateCandidate(candidate, fsModule).catch(() => null);
    if (validated) return validated;
  }
  return null;
}

export async function assertExecutableIdentity(candidate, { fsModule = fs } = {}) {
  if (!candidate || !safeAbsolutePath(candidate.executablePath)) {
    throw new Error("Local Agent executable is not a safe absolute path.");
  }
  const expected = candidate.canonicalIdentity || candidate.executablePath;
  const resolved = await fsModule.promises.realpath(candidate.executablePath);
  if (resolved !== expected) throw new Error("Local Agent executable changed identity before launch.");
  const metadata = await fsModule.promises.stat(resolved);
  if (!metadata.isFile()) throw new Error("Local Agent executable is not a regular file.");
  await fsModule.promises.access(resolved, fsModule.constants.X_OK);
  if (candidate.identityFingerprint && fingerprint(metadata) !== candidate.identityFingerprint) {
    throw new Error("Local Agent executable changed identity before launch.");
  }
  return resolved;
}

function buildCandidates({ descriptors, configuredPaths, env, homedir, platform }) {
  const result = [];
  const seen = new Set();
  const push = (filename, descriptor, source) => {
    if (result.length >= MAX_CANDIDATES || !safeAbsolutePath(filename)) return;
    const key = `${filename}\0${descriptor.invokedAs}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ filename, descriptor, source });
  };

  for (const configured of configuredPaths.slice(0, MAX_NAMES)) {
    if (typeof configured !== "string") continue;
    const descriptor = descriptors.find((entry) => path.basename(configured) === entry.fileName) || descriptors[0];
    push(configured, descriptor, "configured");
  }

  const userDirectories = [
    path.join(homedir, ".local", "bin"),
    path.join(homedir, ".npm-global", "bin"),
    path.join(homedir, ".bun", "bin"),
    path.join(homedir, ".cargo", "bin"),
  ];
  const pathDirectories = String(env?.PATH || "")
    .split(platform === "win32" ? ";" : ":")
    .filter(safeAbsolutePath)
    .slice(0, MAX_PATH_DIRECTORIES);
  const systemDirectories = platform === "win32"
    ? windowsCandidateDirectories(env)
    : ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];

  for (const directory of [...pathDirectories, ...userDirectories, ...systemDirectories]) {
    const source = classifySource(directory, userDirectories, systemDirectories);
    for (const descriptor of descriptors) push(path.join(directory, descriptor.fileName), descriptor, source);
  }
  return result;
}

async function validateCandidate(candidate, fsModule) {
  const resolved = await fsModule.promises.realpath(candidate.filename);
  if (!safeAbsolutePath(resolved)) return null;
  const metadata = await fsModule.promises.stat(resolved);
  if (!metadata.isFile()) return null;
  await fsModule.promises.access(resolved, fsModule.constants.X_OK);
  return Object.freeze({
    executablePath: resolved,
    canonicalIdentity: resolved,
    identityFingerprint: fingerprint(metadata),
    invokedAs: candidate.descriptor.invokedAs,
    argsPrefix: candidate.descriptor.argsPrefix,
    source: candidate.source,
  });
}

function normalizeNames(names, platform) {
  const values = Array.isArray(names) ? names : [names];
  return values.slice(0, MAX_NAMES).flatMap((value) => {
    if (typeof value === "object" && value) {
      const fileName = executableName(value.fileName, platform);
      if (!fileName) return [];
      return [{
        fileName,
        invokedAs: String(value.invokedAs || value.fileName).slice(0, 80),
        argsPrefix: normalizeArgs(value.argsPrefix),
      }];
    }
    if (typeof value !== "string" || !value.trim()) return [];
    const [binary, ...argsPrefix] = value.trim().split(/\s+/);
    const fileName = executableName(binary, platform);
    return fileName ? [{ fileName, invokedAs: value.trim().slice(0, 80), argsPrefix }] : [];
  });
}

function executableName(value, platform) {
  if (!/^[A-Za-z0-9._-]+$/.test(String(value || ""))) return null;
  if (platform === "win32" && !String(value).toLowerCase().endsWith(".exe")) return `${value}.exe`;
  return String(value);
}

function normalizeArgs(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).map(String).filter((entry) => entry.length <= 160 && !/[\r\n\0]/.test(entry));
}

function safeAbsolutePath(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 4_096
    && path.isAbsolute(value)
    && !/[\r\n\0]/.test(value);
}

function fingerprint(metadata) {
  return [metadata.dev, metadata.ino, metadata.size, Math.trunc(metadata.mtimeMs)].join(":");
}

function classifySource(directory, userDirectories, systemDirectories) {
  if (userDirectories.includes(directory)) return "user-installation";
  if (systemDirectories.includes(directory)) return "system-installation";
  return "path-installation";
}

function windowsCandidateDirectories(env) {
  return [
    env?.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs"),
    env?.ProgramFiles,
  ].filter(safeAbsolutePath);
}

export const executableCandidateLimits = Object.freeze({
  maxPathDirectories: MAX_PATH_DIRECTORIES,
  maxNames: MAX_NAMES,
  maxCandidates: MAX_CANDIDATES,
});
