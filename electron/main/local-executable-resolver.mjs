import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_PATH_DIRECTORIES = 48;
const MAX_NAMES = 8;
const MAX_EXECUTABLE_VARIANTS = 2;
const MAX_NODE_MANAGER_VERSIONS = 32;
const MAX_SEARCH_DIRECTORIES = 96;
const MAX_CANDIDATES = (MAX_SEARCH_DIRECTORIES * MAX_NAMES * MAX_EXECUTABLE_VARIANTS)
  + MAX_NAMES;

/**
 * Build one bounded directory snapshot that can be shared by every product in
 * a scan. GUI-launched desktop apps cannot rely on an interactive shell to add
 * Node version-manager bins to PATH.
 */
export async function createExecutableSearchContext({
  env = process.env,
  homedir = os.homedir(),
  platform = process.platform,
  fsModule = fs,
} = {}) {
  const userDirectories = [
    env?.NVM_BIN,
    env?.PNPM_HOME,
    platform === "win32" ? env?.NVM_SYMLINK : null,
    platform === "win32" && env?.APPDATA ? path.join(env.APPDATA, "npm") : null,
    platform === "win32" && env?.LOCALAPPDATA
      ? path.join(env.LOCALAPPDATA, "Volta", "bin")
      : null,
    path.join(homedir, ".local", "bin"),
    path.join(homedir, ".npm-global", "bin"),
    path.join(homedir, ".bun", "bin"),
    path.join(homedir, ".cargo", "bin"),
    path.join(homedir, ".volta", "bin"),
    path.join(homedir, ".asdf", "shims"),
    platform === "win32" ? path.join(homedir, "scoop", "shims") : null,
    path.join(homedir, "bin"),
  ].filter(safeAbsolutePath);
  if (platform !== "win32") {
    userDirectories.push(...await boundedNvmBinDirectories({ env, fsModule, homedir }));
  }
  const pathDirectories = String(env?.PATH || "")
    .split(platform === "win32" ? ";" : ":")
    .filter(safeAbsolutePath)
    .slice(0, MAX_PATH_DIRECTORIES);
  const systemDirectories = platform === "win32"
    ? windowsCandidateDirectories(env)
    : ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
  const directories = [];
  const seen = new Set();
  for (const directory of [...pathDirectories, ...userDirectories, ...systemDirectories]) {
    if (directories.length >= MAX_SEARCH_DIRECTORIES || seen.has(directory)) continue;
    seen.add(directory);
    directories.push(Object.freeze({
      directory,
      source: classifySource(directory, userDirectories, systemDirectories),
    }));
  }
  return Object.freeze({ directories: Object.freeze(directories) });
}

/** Resolve one executable without invoking a login shell or the executable. */
export async function resolveFirstExecutable({
  names,
  configuredPaths = [],
  searchContext = null,
  acceptCandidate = null,
  env = process.env,
  homedir = os.homedir(),
  platform = process.platform,
  fsModule = fs,
} = {}) {
  const descriptors = normalizeNames(names, platform);
  if (descriptors.length === 0) return null;
  const context = searchContext ?? await createExecutableSearchContext({
    env,
    homedir,
    platform,
    fsModule,
  });
  const candidates = buildCandidates({
    descriptors,
    configuredPaths,
    searchContext: context,
  });

  for (const candidate of candidates) {
    const validated = await validateCandidate(candidate, fsModule).catch(() => null);
    if (!validated) continue;
    if (typeof acceptCandidate === "function") {
      const accepted = await Promise.resolve(acceptCandidate(validated)).catch(() => false);
      if (!accepted) continue;
    }
    return validated;
  }
  return null;
}

export async function assertExecutableIdentity(candidate, { fsModule = fs } = {}) {
  if (!candidate || !safeAbsolutePath(candidate.executablePath)) {
    throw new Error("Local executable is not a safe absolute path.");
  }
  const expected = candidate.canonicalIdentity || candidate.executablePath;
  const resolved = await fsModule.promises.realpath(candidate.executablePath);
  if (resolved !== expected) throw new Error("Local executable changed identity before launch.");
  const metadata = await fsModule.promises.stat(resolved);
  if (!metadata.isFile()) throw new Error("Local executable is not a regular file.");
  await fsModule.promises.access(resolved, fsModule.constants.X_OK);
  if (candidate.identityFingerprint && fingerprint(metadata) !== candidate.identityFingerprint) {
    throw new Error("Local executable changed identity before launch.");
  }
  return resolved;
}

function buildCandidates({ descriptors, configuredPaths, searchContext }) {
  const result = [];
  const seen = new Set();
  const push = (filename, descriptor, source) => {
    if (result.length >= MAX_CANDIDATES || !safeAbsolutePath(filename)) return;
    const key = `${filename}\0${descriptor.invokedAs}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ filename, descriptor, source });
  };

  const trustedConfiguredPaths = Array.isArray(configuredPaths) ? configuredPaths : [];
  for (const configured of trustedConfiguredPaths.slice(0, MAX_NAMES)) {
    if (typeof configured !== "string") continue;
    const descriptor = descriptors.find((entry) => path.basename(configured) === entry.fileName) || descriptors[0];
    push(configured, descriptor, "configured");
  }

  for (const entry of searchContext?.directories ?? []) {
    const directory = entry?.directory;
    const source = typeof entry?.source === "string" ? entry.source : "search-context";
    if (!safeAbsolutePath(directory)) continue;
    for (const descriptor of descriptors) push(path.join(directory, descriptor.fileName), descriptor, source);
  }
  return result;
}

async function validateCandidate(candidate, fsModule) {
  const resolved = await fsModule.promises.realpath(candidate.filename);
  const launchPathEntry = await fsModule.promises.realpath(path.dirname(candidate.filename));
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
    launchPathEntry,
    source: candidate.source,
  });
}

function normalizeNames(names, platform) {
  const values = Array.isArray(names) ? names : [names];
  return values.slice(0, MAX_NAMES).flatMap((value) => {
    if (typeof value === "object" && value) {
      const fileNames = executableNames(value.fileName, platform);
      return fileNames.map((fileName) => ({
        fileName,
        invokedAs: String(value.invokedAs || value.fileName).slice(0, 80),
        argsPrefix: normalizeArgs(value.argsPrefix),
      }));
    }
    if (typeof value !== "string" || !value.trim()) return [];
    const [binary, ...argsPrefix] = value.trim().split(/\s+/);
    return executableNames(binary, platform).map((fileName) => ({
      fileName,
      invokedAs: value.trim().slice(0, 80),
      argsPrefix,
    }));
  });
}

function executableNames(value, platform) {
  const normalized = String(value || "");
  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) return [];
  if (platform !== "win32" || /\.(?:cmd|exe)$/iu.test(normalized)) return [normalized];
  return [`${normalized}.exe`, `${normalized}.cmd`];
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
    env?.ProgramFiles && path.join(env.ProgramFiles, "nodejs"),
  ].filter(safeAbsolutePath);
}

async function boundedNvmBinDirectories({ env, fsModule, homedir }) {
  const nvmRoot = safeAbsolutePath(env?.NVM_DIR)
    ? env.NVM_DIR
    : path.join(homedir, ".nvm");
  const versionsRoot = path.join(nvmRoot, "versions", "node");
  try {
    return (await fsModule.promises.readdir(versionsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(compareNodeVersionsDescending)
      .slice(0, MAX_NODE_MANAGER_VERSIONS)
      .map((version) => path.join(versionsRoot, version, "bin"));
  } catch {
    return [];
  }
}

function compareNodeVersionsDescending(left, right) {
  const parts = (value) => String(value).replace(/^v/u, "").split(".").map((entry) => Number(entry) || 0);
  const a = parts(left);
  const b = parts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (b[index] ?? 0) - (a[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return String(right).localeCompare(String(left));
}

export const executableCandidateLimits = Object.freeze({
  maxPathDirectories: MAX_PATH_DIRECTORIES,
  maxNames: MAX_NAMES,
  maxCandidates: MAX_CANDIDATES,
  maxExecutableVariants: MAX_EXECUTABLE_VARIANTS,
  maxNodeManagerVersions: MAX_NODE_MANAGER_VERSIONS,
  maxSearchDirectories: MAX_SEARCH_DIRECTORIES,
});
