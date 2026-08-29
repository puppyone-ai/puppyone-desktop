import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const LEASE_FILENAME = "auto-commit.lease.json";
const TAKEOVER_STALE_MS = 5 * 60 * 1000;

/** Token-fenced owner election across concurrently installed Desktop builds. */
export function createGitAutoCommitOperationLease({
  fsApi = fs.promises,
  randomUUID = crypto.randomUUID,
  now = () => Date.now(),
  isProcessAlive = defaultIsProcessAlive,
} = {}) {
  async function acquire(identity) {
    if (!identity?.repository || !identity.commonDir) {
      throw new Error("A canonical Git repository identity is required for Auto Commit.");
    }
    const directory = path.join(identity.commonDir, "puppyone");
    const leasePath = path.join(directory, LEASE_FILENAME);
    const takeoverPath = `${leasePath}.takeover`;
    await ensureSafeDirectory(directory, fsApi);
    const ownerToken = randomUUID();

    if (!await tryCreateLease(leasePath, ownerToken, fsApi, now)) {
      const takeover = await tryAcquireTakeover(takeoverPath, fsApi, ownerToken);
      if (!takeover) return null;
      try {
        const current = await readLease(leasePath, fsApi).catch(() => null);
        const metadata = await fsApi.lstat(leasePath).catch(() => null);
        const live = Number.isSafeInteger(current?.pid) && current.pid > 0 && isProcessAlive(current.pid);
        const stale = metadata && now() - metadata.mtimeMs >= TAKEOVER_STALE_MS;
        if (live || (!current && !stale)) return null;
        await fsApi.rm(leasePath, { force: true });
        if (!await tryCreateLease(leasePath, ownerToken, fsApi, now)) return null;
      } finally {
        await releaseTakeover(takeoverPath, ownerToken, fsApi);
      }
    }

    let released = false;
    return Object.freeze({
      ownerToken,
      async release() {
        if (released) return;
        released = true;
        const current = await readLease(leasePath, fsApi).catch(() => null);
        if (current?.owner_token !== ownerToken) return;
        await fsApi.rm(leasePath, { force: true });
        await syncDirectoryBestEffort(directory, fsApi);
      },
    });
  }

  return Object.freeze({ acquire });
}

async function tryCreateLease(leasePath, ownerToken, fsApi, now) {
  let handle = null;
  try {
    handle = await fsApi.open(leasePath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify({
      version: 1,
      owner_token: ownerToken,
      pid: process.pid,
      acquired_at: new Date(now()).toISOString(),
    })}\n`, "utf8");
    await handle.sync();
    await handle.close();
    return true;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (error?.code === "EEXIST") return false;
    throw error;
  }
}

async function tryAcquireTakeover(takeoverPath, fsApi, ownerToken) {
  let handle = null;
  try {
    handle = await fsApi.open(takeoverPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify({ owner_token: ownerToken, pid: process.pid })}\n`, "utf8");
    await handle.sync();
    await handle.close();
    return true;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (error?.code === "EEXIST") return false;
    throw error;
  }
}

async function releaseTakeover(takeoverPath, ownerToken, fsApi) {
  const current = await readLease(takeoverPath, fsApi).catch(() => null);
  if (current?.owner_token === ownerToken) await fsApi.rm(takeoverPath, { force: true });
}

async function readLease(filePath, fsApi) {
  const metadata = await fsApi.lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 4096) return null;
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) return null;
  const value = JSON.parse(await fsApi.readFile(filePath, "utf8"));
  return typeof value?.owner_token === "string" && Number.isSafeInteger(value.pid) ? value : null;
}

async function ensureSafeDirectory(directory, fsApi) {
  await fsApi.mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = await fsApi.lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Git Auto Commit lease directory is unsafe.");
  }
  await fsApi.chmod(directory, 0o700).catch(() => undefined);
}

function defaultIsProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function syncDirectoryBestEffort(directory, fsApi) {
  let handle = null;
  try {
    handle = await fsApi.open(directory, "r");
    await handle.sync();
  } catch {
    // Best effort where directory fsync is unsupported.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
