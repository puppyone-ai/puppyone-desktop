import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function prepareOpenCodeDevelopmentRuntime({
  root = projectRoot,
  platform = process.platform,
  arch = process.arch,
  fetchImpl = globalThis.fetch,
  cacheRoot = process.env.PUPPYONE_OPENCODE_DOWNLOAD_CACHE
    || path.join(root, "node_modules", ".cache", "puppyone", "opencode"),
  log = console,
} = {}) {
  const manifestPath = path.join(root, "vendor", "opencode", "runtime-manifest.json");
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8"));
  const artifact = manifest.artifacts?.[`${platform}-${arch}`];
  if (!artifact) throw new Error(`No pinned OpenCode runtime exists for ${platform}-${arch}.`);

  if (verifiedRuntimeExists(root, platform, arch)) {
    log.info?.(`[desktop-dev] Managed Agent engine ${manifest.runtimeRelease.version} is ready.`);
    return { status: "ready", source: "staged" };
  }
  if (typeof fetchImpl !== "function") throw new Error("This Node.js version cannot download the managed Agent engine.");

  const version = manifest.runtimeRelease.version;
  const archivePath = path.join(cacheRoot, `v${version}`, artifact.archive);
  await fs.promises.mkdir(path.dirname(archivePath), { recursive: true });
  if (!await archiveMatches(archivePath, artifact)) {
    const url = runtimeDownloadUrl(manifest, artifact);
    log.info?.(`[desktop-dev] Preparing PuppyOne's managed Agent engine ${version}…`);
    try {
      await downloadVerifiedArchive({ url, archivePath, artifact, fetchImpl });
    } catch (fetchError) {
      await downloadVerifiedArchiveWithCurl({ url, archivePath, artifact, fetchError });
    }
  }

  const result = spawnSync(process.execPath, [path.join(root, "scripts", "stage-opencode-runtime.mjs"), archivePath], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 180_000,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "Unable to stage the managed Agent engine.").trim());
  }
  log.info?.((result.stdout || `Staged managed Agent engine ${version}.`).trim());
  return { status: "ready", source: "download", archivePath };
}

export function runtimeDownloadUrl(manifest, artifact) {
  const repository = String(manifest.repository || "").replace(/\/+$/, "");
  if (repository !== "https://github.com/anomalyco/opencode") {
    throw new Error("The OpenCode runtime repository is not allowlisted.");
  }
  return `${repository}/releases/download/v${manifest.runtimeRelease.version}/${artifact.archive}`;
}

export async function archiveMatches(archivePath, artifact) {
  const stat = await fs.promises.stat(archivePath).catch(() => null);
  if (!stat?.isFile() || stat.size !== artifact.bytes) return false;
  return await hashFile(archivePath) === artifact.sha256;
}

async function downloadVerifiedArchive({ url, archivePath, artifact, fetchImpl }) {
  const temporaryPath = `${archivePath}.${process.pid}.tmp`;
  await fs.promises.rm(temporaryPath, { force: true });
  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(180_000),
      headers: { "user-agent": "puppyone-desktop-runtime-bootstrap" },
    });
    if (!response.ok || !response.body) throw new Error(`Managed Agent engine download failed with HTTP ${response.status}.`);
    const declaredBytes = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredBytes) && declaredBytes !== artifact.bytes) {
      throw new Error(`Managed Agent engine download size mismatch: expected ${artifact.bytes}, received ${declaredBytes}.`);
    }
    const handle = await fs.promises.open(temporaryPath, "wx", 0o600);
    const hash = crypto.createHash("sha256");
    let bytes = 0;
    try {
      for await (const chunk of response.body) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > artifact.bytes) throw new Error("Managed Agent engine download exceeded the pinned size.");
        hash.update(buffer);
        await handle.write(buffer);
      }
    } finally {
      await handle.close();
    }
    if (bytes !== artifact.bytes) throw new Error(`Managed Agent engine download is incomplete: expected ${artifact.bytes}, received ${bytes}.`);
    if (hash.digest("hex") !== artifact.sha256) throw new Error("Managed Agent engine download failed SHA-256 verification.");
    await fs.promises.rm(archivePath, { force: true });
    await fs.promises.rename(temporaryPath, archivePath);
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true });
    throw error;
  }
}

async function downloadVerifiedArchiveWithCurl({ url, archivePath, artifact, fetchError }) {
  const temporaryPath = `${archivePath}.${process.pid}.curl.tmp`;
  await fs.promises.rm(temporaryPath, { force: true });
  const result = spawnSync("curl", [
    "--fail",
    "--location",
    "--retry", "3",
    "--silent",
    "--show-error",
    "--output", temporaryPath,
    url,
  ], {
    encoding: "utf8",
    shell: false,
    timeout: 180_000,
  });
  if (result.status !== 0 || !await archiveMatches(temporaryPath, artifact)) {
    await fs.promises.rm(temporaryPath, { force: true });
    const fetchMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
    const curlMessage = (result.stderr || result.stdout || "curl unavailable").trim();
    throw new Error(`Managed Agent engine download failed (${fetchMessage}; ${curlMessage}).`);
  }
  await fs.promises.rm(archivePath, { force: true });
  await fs.promises.rename(temporaryPath, archivePath);
}

function verifiedRuntimeExists(root, platform, arch) {
  const check = spawnSync(process.execPath, [path.join(root, "scripts", "check-opencode-release.mjs")], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 15_000,
  });
  if (check.status !== 0) return false;
  const verified = JSON.parse(fs.readFileSync(path.join(root, "vendor", "opencode", "bin", "verified-runtime.json"), "utf8"));
  return verified.platform === platform && verified.arch === arch;
}

async function hashFile(filename) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

async function main() {
  const optional = process.argv.includes("--optional");
  try {
    await prepareOpenCodeDevelopmentRuntime();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!optional) throw error;
    console.warn(`[desktop-dev] Managed Agent engine is not ready: ${message}`);
    console.warn("[desktop-dev] The rest of PuppyOne will start normally; Chat can retry after the engine is prepared.");
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
