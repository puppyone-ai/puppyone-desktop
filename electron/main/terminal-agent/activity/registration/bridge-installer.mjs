import fs from "node:fs/promises";
import path from "node:path";

const BRIDGE_FILES = Object.freeze([
  "puppyone-agent-hook.mjs",
  "payload-projector.mjs",
  "shell-file-intent.mjs",
]);

export function createAgentActivityBridgeInstaller({
  sourceDirectory,
  userDataPath,
  executablePath = process.execPath,
  platform = process.platform,
  fsService = fs,
}) {
  const installDirectory = path.join(userDataPath, "agent-activity", "bridge", "current");
  const bridgePath = path.join(installDirectory, "puppyone-agent-hook.mjs");
  let ensurePromise = null;

  async function install() {
    await fsService.mkdir(installDirectory, { recursive: true, mode: 0o700 });
    for (const fileName of BRIDGE_FILES) {
      const source = await fsService.readFile(path.join(sourceDirectory, fileName));
      await writeAtomic(path.join(installDirectory, fileName), source, fsService);
    }
    return Object.freeze({ bridgePath, command: createBridgeCommand({ bridgePath, executablePath, platform }) });
  }

  async function exists() {
    return Promise.all(BRIDGE_FILES.map((fileName) => (
      fsService.access(path.join(installDirectory, fileName)).then(() => true, () => false)
    ))).then((results) => results.every(Boolean));
  }

  async function isCurrent() {
    try {
      for (const fileName of BRIDGE_FILES) {
        const [source, installed] = await Promise.all([
          fsService.readFile(path.join(sourceDirectory, fileName)),
          fsService.readFile(path.join(installDirectory, fileName)),
        ]);
        if (!Buffer.from(source).equals(Buffer.from(installed))) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async function ensureCurrent() {
    if (!ensurePromise) {
      ensurePromise = (async () => {
        if (!(await isCurrent())) await install();
        return Object.freeze({ bridgePath, command: createBridgeCommand({ bridgePath, executablePath, platform }) });
      })().finally(() => {
        ensurePromise = null;
      });
    }
    return ensurePromise;
  }

  return Object.freeze({
    install,
    exists,
    isCurrent,
    ensureCurrent,
    bridgePath,
    command: createBridgeCommand({ bridgePath, executablePath, platform }),
  });
}

export function createBridgeCommand({ bridgePath, executablePath, platform = process.platform }) {
  if (platform === "win32") {
    return `set "ELECTRON_RUN_AS_NODE=1" && ${quoteWindows(executablePath)} ${quoteWindows(bridgePath)}`;
  }
  return `/usr/bin/env ELECTRON_RUN_AS_NODE=1 ${quotePosix(executablePath)} ${quotePosix(bridgePath)}`;
}

async function writeAtomic(targetPath, source, fsService) {
  const tempPath = `${targetPath}.${process.pid}-${Date.now()}.tmp`;
  try {
    await fsService.writeFile(tempPath, source, { mode: 0o700, flag: "wx" });
    await fsService.rename(tempPath, targetPath);
    await fsService.chmod(targetPath, 0o700).catch(() => undefined);
  } catch (error) {
    await fsService.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

function quotePosix(value) {
  return `'${String(value).replace(/'/gu, `'"'"'`)}'`;
}

function quoteWindows(value) {
  return `"${String(value).replace(/"/gu, '\\"')}"`;
}
