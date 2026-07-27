#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_REMOTE_HOST = "downloads.puppyone.ai";
const DOWNLOAD_PROGRESS_REFRESH_MS = 100;
const DOWNLOAD_PROGRESS_MILESTONE_PERCENT = 10;

export async function preparePreviewApp({
  packageRoot,
  cacheRoot,
  metadata,
  fetchImpl = globalThis.fetch,
  log = console,
  onDownloadProgress = null,
} = {}) {
  const resolvedPackageRoot = packageRoot
    ? path.resolve(packageRoot)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const packageMetadata = metadata
    ? { ...metadata }
    : await readPackagePreviewMetadata(resolvedPackageRoot);
  validatePreviewMetadata(packageMetadata);
  validateRuntimePlatform(packageMetadata);

  const resolvedCacheRoot = cacheRoot
    ? path.resolve(cacheRoot)
    : getDefaultPreviewCacheRoot(packageMetadata);
  const appRoot = path.join(resolvedCacheRoot, packageMetadata.appBundleName);
  const executablePath = path.join(appRoot, packageMetadata.executableRelativePath);
  const markerPath = path.join(resolvedCacheRoot, ".preview-ready.json");

  if (await cachedAppMatches({
    executablePath,
    markerPath,
    metadata: packageMetadata,
  })) {
    return {
      appRoot,
      cacheRoot: resolvedCacheRoot,
      executablePath,
      metadata: packageMetadata,
      reused: true,
    };
  }

  await fs.promises.mkdir(path.dirname(resolvedCacheRoot), { recursive: true });
  const temporaryRoot = await fs.promises.mkdtemp(
    path.join(path.dirname(resolvedCacheRoot), ".puppyone-preview-"),
  );
  const archivePath = path.join(temporaryRoot, "puppyone-preview.zip");
  const extractionRoot = path.join(temporaryRoot, "extracted");

  try {
    if (typeof onDownloadProgress !== "function") {
      log.info?.(`Downloading PuppyOne preview ${packageMetadata.appVersion}…`);
    }
    await downloadVerifiedArchive({
      archivePath,
      fetchImpl,
      metadata: packageMetadata,
      onProgress: onDownloadProgress,
    });
    log.info?.(`Preparing downloaded PuppyOne preview ${packageMetadata.appVersion}…`);
    await fs.promises.mkdir(extractionRoot, { recursive: true });
    await runCommand("/usr/bin/ditto", ["-x", "-k", archivePath, extractionRoot]);

    const extractedAppRoot = path.join(extractionRoot, packageMetadata.appBundleName);
    const extractedExecutable = path.join(
      extractedAppRoot,
      packageMetadata.executableRelativePath,
    );
    const executableStat = await fs.promises.stat(extractedExecutable).catch(() => null);
    if (!executableStat?.isFile()) {
      throw new Error(
        `The preview archive does not contain ${packageMetadata.appBundleName}/${packageMetadata.executableRelativePath}.`,
      );
    }
    await runCommand("/usr/bin/codesign", [
      "--verify",
      "--deep",
      "--strict",
      extractedAppRoot,
    ]);

    await fs.promises.writeFile(
      path.join(extractionRoot, ".preview-ready.json"),
      `${JSON.stringify(createReadyMarker(packageMetadata), null, 2)}\n`,
      { mode: 0o600 },
    );
    await fs.promises.rm(resolvedCacheRoot, { recursive: true, force: true });
    await fs.promises.rename(extractionRoot, resolvedCacheRoot);

    return {
      appRoot,
      cacheRoot: resolvedCacheRoot,
      executablePath,
      metadata: packageMetadata,
      reused: false,
    };
  } finally {
    await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function launchPreviewApp({
  executablePath,
  appArguments = [],
  detached = false,
  environment = process.env,
} = {}) {
  if (!executablePath) throw new Error("A preview executable path is required.");

  const child = spawn(executablePath, appArguments, {
    cwd: path.dirname(executablePath),
    detached,
    env: {
      ...environment,
      PUPPYONE_TERMINAL_PREVIEW: "1",
    },
    stdio: detached ? "ignore" : "inherit",
  });

  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });

  if (detached) {
    child.unref();
    return { child, exitCode: null };
  }

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  }

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve(typeof code === "number" ? code : signal ? 1 : 0);
    });
  });
  return { child, exitCode };
}

export function validatePreviewMetadata(metadata) {
  for (const key of [
    "appVersion",
    "packageVersion",
    "arch",
    "archiveUrl",
    "archiveSha256",
    "appBundleName",
    "executableRelativePath",
  ]) {
    if (typeof metadata?.[key] !== "string" || metadata[key].trim().length === 0) {
      throw new Error(`Terminal preview metadata is missing ${key}.`);
    }
  }
  if (!/^[a-f0-9]{64}$/i.test(metadata.archiveSha256)) {
    throw new Error("Terminal preview metadata contains an invalid archive SHA-256.");
  }
  if (!Number.isSafeInteger(metadata.archiveBytes) || metadata.archiveBytes <= 0) {
    throw new Error("Terminal preview metadata contains an invalid archive byte size.");
  }
  if (path.basename(metadata.appBundleName) !== metadata.appBundleName) {
    throw new Error("Terminal preview appBundleName must be a single path component.");
  }
  if (
    path.isAbsolute(metadata.executableRelativePath)
    || metadata.executableRelativePath.split(/[\\/]/).includes("..")
  ) {
    throw new Error("Terminal preview executableRelativePath must stay inside the app bundle.");
  }

  const archiveUrl = new URL(metadata.archiveUrl);
  if (archiveUrl.protocol === "file:") return;
  if (archiveUrl.protocol !== "https:") {
    throw new Error("Terminal preview archives must use HTTPS.");
  }
  if (archiveUrl.hostname !== (metadata.allowedArchiveHost || DEFAULT_REMOTE_HOST)) {
    throw new Error(`Terminal preview archives must be hosted by ${metadata.allowedArchiveHost || DEFAULT_REMOTE_HOST}.`);
  }
}

export function getDefaultPreviewCacheRoot(metadata) {
  const platformCacheRoot = process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Caches")
    : path.join(os.homedir(), ".cache");
  return path.join(
    platformCacheRoot,
    "ai.puppyone.desktop",
    "terminal-preview",
    `${metadata.packageVersion}-${metadata.arch}-${metadata.archiveSha256.slice(0, 12)}`,
  );
}

async function readPackagePreviewMetadata(packageRoot) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, "utf8"));
  const metadata = packageJson.puppyoneTerminalPreview;
  return {
    ...metadata,
    packageVersion: packageJson.version,
  };
}

function validateRuntimePlatform(metadata) {
  if (process.platform !== "darwin") {
    throw new Error("The PuppyOne terminal preview currently supports macOS only.");
  }
  if (process.arch !== metadata.arch) {
    throw new Error(
      `This preview is for ${metadata.arch}, but this Mac is running Node for ${process.arch}.`,
    );
  }
}

async function cachedAppMatches({ executablePath, markerPath, metadata }) {
  const executableStat = await fs.promises.stat(executablePath).catch(() => null);
  if (!executableStat?.isFile()) return false;
  const marker = await fs.promises.readFile(markerPath, "utf8")
    .then((value) => JSON.parse(value))
    .catch(() => null);
  return marker?.archiveSha256 === metadata.archiveSha256
    && marker?.appVersion === metadata.appVersion
    && marker?.arch === metadata.arch;
}

function createReadyMarker(metadata) {
  return {
    appVersion: metadata.appVersion,
    arch: metadata.arch,
    archiveSha256: metadata.archiveSha256,
    preparedAt: new Date().toISOString(),
  };
}

async function downloadVerifiedArchive({
  archivePath,
  fetchImpl,
  metadata,
  onProgress,
}) {
  const archiveUrl = new URL(metadata.archiveUrl);
  if (archiveUrl.protocol === "file:") {
    await fs.promises.copyFile(fileURLToPath(archiveUrl), archivePath);
  } else {
    if (typeof fetchImpl !== "function") {
      throw new Error("Node.js 18 or later is required to download the PuppyOne preview.");
    }
    notifyDownloadProgress(onProgress, 0, metadata.archiveBytes);
    const response = await fetchImpl(archiveUrl, {
      headers: { "user-agent": "puppyone-terminal-preview" },
      redirect: "follow",
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`PuppyOne preview download failed with HTTP ${response.status}.`);
    }
    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader !== null) {
      const declaredBytes = Number(contentLengthHeader);
      if (!Number.isSafeInteger(declaredBytes) || declaredBytes !== metadata.archiveBytes) {
        throw new Error(
          `PuppyOne preview download size mismatch: expected ${metadata.archiveBytes}, received ${contentLengthHeader}.`,
        );
      }
    }

    const handle = await fs.promises.open(archivePath, "wx", 0o600);
    let bytes = 0;
    try {
      for await (const chunk of response.body) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > metadata.archiveBytes) {
          throw new Error("PuppyOne preview download exceeded the expected size.");
        }
        await handle.write(buffer);
        notifyDownloadProgress(onProgress, bytes, metadata.archiveBytes);
      }
    } finally {
      await handle.close();
    }
  }

  const archiveStat = await fs.promises.stat(archivePath);
  if (archiveStat.size !== metadata.archiveBytes) {
    throw new Error(
      `PuppyOne preview archive size mismatch: expected ${metadata.archiveBytes}, received ${archiveStat.size}.`,
    );
  }
  const actualSha256 = await hashFile(archivePath);
  if (actualSha256 !== metadata.archiveSha256) {
    throw new Error("PuppyOne preview archive failed SHA-256 verification.");
  }
}

function notifyDownloadProgress(onProgress, downloadedBytes, totalBytes) {
  if (typeof onProgress !== "function") return;
  onProgress({
    downloadedBytes,
    percent: totalBytes > 0
      ? Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100))
      : null,
    totalBytes,
  });
}

export function createTerminalDownloadProgress({ label, stream }) {
  const interactive = stream?.isTTY === true;
  let active = false;
  let completed = false;
  let lastMilestone = -1;
  let lastRenderedAt = 0;

  function update({ downloadedBytes, percent, totalBytes }) {
    if (completed || typeof stream?.write !== "function") return;

    const now = Date.now();
    if (interactive) {
      if (
        active
        && percent !== 100
        && now - lastRenderedAt < DOWNLOAD_PROGRESS_REFRESH_MS
      ) {
        return;
      }
      stream.write(
        `\r\u001b[2K${formatDownloadProgress(label, downloadedBytes, totalBytes, percent)}`,
      );
      active = true;
      lastRenderedAt = now;
      if (percent === 100) {
        stream.write("\n");
        completed = true;
      }
      return;
    }

    const milestone = percent === 100
      ? 100
      : Math.floor((percent ?? 0) / DOWNLOAD_PROGRESS_MILESTONE_PERCENT)
        * DOWNLOAD_PROGRESS_MILESTONE_PERCENT;
    if (milestone <= lastMilestone) return;
    stream.write(
      `${formatDownloadProgress(label, downloadedBytes, totalBytes, percent)}\n`,
    );
    active = true;
    lastMilestone = milestone;
    if (percent === 100) completed = true;
  }

  function stop() {
    if (interactive && active && !completed && typeof stream?.write === "function") {
      stream.write("\n");
    }
    completed = true;
  }

  return { stop, update };
}

function formatDownloadProgress(label, downloadedBytes, totalBytes, percent) {
  const progressPercent = Number.isFinite(percent) ? `${percent}%` : "";
  const byteCounts = totalBytes > 0
    ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
    : formatBytes(downloadedBytes);
  return `${label} ${progressPercent} (${byteCounts})`.replace("  ", " ");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  if (unitIndex === 0) return `${Math.round(value)} ${units[unitIndex]}`;
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

async function hashFile(filename) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

async function runCommand(command, args) {
  const child = spawn(command, args, {
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0) {
    throw new Error(
      `${command} failed with ${result.signal ? `signal ${result.signal}` : `code ${result.code}`}${stderr ? `: ${stderr.trim()}` : ""}`,
    );
  }
}

function parseArguments(argv) {
  const options = {
    appArguments: [],
    clean: false,
    detached: false,
    prepareOnly: false,
  };
  for (const argument of argv) {
    if (argument === "--clean") {
      options.clean = true;
    } else if (argument === "--detach") {
      options.detached = true;
    } else if (argument === "--prepare-only") {
      options.prepareOnly = true;
    } else {
      options.appArguments.push(argument);
    }
  }
  return options;
}

async function main() {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const options = parseArguments(process.argv.slice(2));
  const metadata = await readPackagePreviewMetadata(packageRoot);
  validatePreviewMetadata(metadata);
  const cacheRoot = getDefaultPreviewCacheRoot(metadata);
  if (options.clean) {
    await fs.promises.rm(cacheRoot, { recursive: true, force: true });
  }

  const downloadProgress = createTerminalDownloadProgress({
    label: `Downloading PuppyOne preview ${metadata.appVersion}…`,
    stream: process.stdout,
  });
  let prepared;
  try {
    prepared = await preparePreviewApp({
      cacheRoot,
      metadata,
      onDownloadProgress: downloadProgress.update,
      packageRoot,
    });
  } finally {
    downloadProgress.stop();
  }
  if (options.prepareOnly) {
    console.log(prepared.appRoot);
    return;
  }

  console.info(
    `${prepared.reused ? "Opening" : "Prepared and opening"} PuppyOne ${metadata.appVersion} terminal preview…`,
  );
  const result = await launchPreviewApp({
    appArguments: options.appArguments,
    detached: options.detached,
    executablePath: prepared.executablePath,
  });
  if (options.detached) {
    console.info("PuppyOne is opening in a separate window.");
    return;
  }
  process.exitCode = result.exitCode ?? 0;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
