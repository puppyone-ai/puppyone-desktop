import fs from "node:fs";
import path from "node:path";

const MAX_NVM_VERSIONS = 32;

/** Bounded, deterministic Claude Code candidates for GUI-launched apps. */
export async function claudeCliCandidates({
  fsModule = fs,
  env = process.env,
  homedir,
  platform = process.platform,
} = {}) {
  const executable = platform === "win32" ? "claude.exe" : "claude";
  const candidates = [
    env.CLAUDE_CODE_PATH,
    env.NVM_BIN && path.join(env.NVM_BIN, executable),
    path.join(homedir, ".claude", "local", executable),
    path.join(homedir, ".local", "bin", executable),
    path.join(homedir, ".volta", "bin", executable),
    path.join(homedir, ".asdf", "shims", executable),
    path.join(homedir, ".asdf", "bin", executable),
    path.join(homedir, "bin", executable),
    path.join(homedir, ".npm-global", "bin", executable),
  ].filter(Boolean);
  if (platform !== "win32") {
    const nvmRoot = env.NVM_DIR || path.join(homedir, ".nvm");
    const versionsRoot = path.join(nvmRoot, "versions", "node");
    try {
      const versions = (await fsModule.promises.readdir(versionsRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(compareNodeVersionsDescending)
        .slice(0, MAX_NVM_VERSIONS);
      for (const version of versions) candidates.push(path.join(versionsRoot, version, "bin", executable));
    } catch {
      // NVM is optional.
    }
    for (const packageParent of [
      path.join(homedir, ".npm-global", "lib"),
      "/usr/local/lib",
      "/usr/lib",
    ]) {
      candidates.push(path.join(packageParent, "node_modules", "@anthropic-ai", "claude-code", "cli-wrapper.cjs"));
      candidates.push(path.join(packageParent, "node_modules", "@anthropic-ai", "claude-code", "cli.js"));
    }
  }
  return Array.from(new Set(candidates.map((candidate) => path.resolve(candidate))));
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

export const claudeCliDiscoveryPolicy = Object.freeze({ maxNvmVersions: MAX_NVM_VERSIONS });

