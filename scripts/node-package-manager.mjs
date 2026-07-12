/** Return the executable name Node can spawn for npm on a given platform. */
export function getNpmExecutable(platform = process.platform) {
  return platform === "win32" ? "npm.cmd" : "npm";
}

/** Windows command shims are batch files and must be spawned through cmd.exe. */
export function getNpmSpawnOptions(platform = process.platform) {
  return platform === "win32" ? { shell: true } : {};
}
