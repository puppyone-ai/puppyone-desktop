import fs from "node:fs/promises";
import path from "node:path";

export async function readOwnedJsonFile(configPath, fsService = fs) {
  let source;
  try {
    source = await fsService.readFile(configPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return Object.freeze({ source: null, value: {} });
  }
  try {
    const value = JSON.parse(source);
    return isRecord(value)
      ? Object.freeze({ source, value })
      : Object.freeze({ source, value: {}, error: true });
  } catch {
    return Object.freeze({ source, value: {}, error: true });
  }
}

export async function writeOwnedJsonFileIfUnchanged({
  configPath,
  originalSource,
  value,
  fsService = fs,
}) {
  const latest = await readOwnedJsonFile(configPath, fsService);
  if (latest.source !== originalSource) throw new Error("AGENT_ACTIVITY_CONFIG_CHANGED");
  await fsService.mkdir(path.dirname(configPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${configPath}.puppyone-${process.pid}-${Date.now()}.tmp`;
  const source = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await fsService.writeFile(temporaryPath, source, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await fsService.rename(temporaryPath, configPath);
    await fsService.chmod(configPath, 0o600).catch(() => undefined);
  } catch (error) {
    await fsService.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
