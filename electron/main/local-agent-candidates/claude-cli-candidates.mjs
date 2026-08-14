import path from "node:path";

/** Product-specific Claude candidates layered before the shared search context. */
export function claudeCliCandidates({
  env = process.env,
  homedir,
  platform = process.platform,
} = {}) {
  const executable = platform === "win32" ? "claude.exe" : "claude";
  const candidates = [
    env.CLAUDE_CODE_PATH,
    path.join(homedir, ".claude", "local", executable),
  ].filter(Boolean);
  if (platform !== "win32") {
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

export const claudeCliDiscoveryPolicy = Object.freeze({ usesSharedSearchContext: true });
