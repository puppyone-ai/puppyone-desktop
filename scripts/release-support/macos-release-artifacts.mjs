import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export async function verifyMacReleaseArtifacts(releaseDirectory) {
  const entries = await collectPaths(releaseDirectory);
  const apps = entries.filter((entryPath) => entryPath.endsWith(".app"));
  const dmgs = entries.filter((entryPath) => entryPath.endsWith(".dmg"));
  const zips = entries.filter((entryPath) => entryPath.endsWith(".zip"));
  const updateMetadata = entries.filter((entryPath) => /latest-mac\.yml$/.test(entryPath));

  if (apps.length === 0) throw new Error("No packaged macOS .app was found for signature verification.");
  if (dmgs.length === 0) throw new Error("No macOS DMG release artifact was produced.");
  if (zips.length === 0) throw new Error("No macOS ZIP release artifact was produced for auto-update.");
  if (updateMetadata.length === 0) throw new Error("No latest-mac.yml update metadata was produced.");

  for (const appPath of apps) {
    await runCommand("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
    const signature = await runCommand("/usr/bin/codesign", ["-dv", "--verbose=4", appPath], { capture: true });
    if (!/Authority=Developer ID Application:/.test(signature)) {
      throw new Error(`${path.basename(appPath)} is not signed with a Developer ID Application certificate.`);
    }

    const gatekeeper = await runCommand("/usr/sbin/spctl", [
      "--assess",
      "--type",
      "execute",
      "--verbose=4",
      appPath,
    ], { capture: true });
    if (!/accepted/i.test(gatekeeper) || !/source=Notarized Developer ID/i.test(gatekeeper)) {
      throw new Error(`${path.basename(appPath)} was not accepted as a notarized Developer ID app.`);
    }

    await runCommand("/usr/bin/xcrun", ["stapler", "validate", appPath]);
  }

  for (const metadataPath of updateMetadata) {
    const metadata = await fs.readFile(metadataPath, "utf8");
    if (!/\.zip(?:\s|$)/m.test(metadata) || !/sha512:/m.test(metadata)) {
      throw new Error(`${path.basename(metadataPath)} does not contain a ZIP auto-update artifact and checksum.`);
    }
  }

  return { apps, dmgs, updateMetadata, zips };
}

export async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    if (options.capture) {
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => { stdout += chunk; });
      child.stderr?.on("data", (chunk) => { stderr += chunk; });
    }
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(`${stdout}\n${stderr}`.trim());
        return;
      }
      reject(new Error(`${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

async function collectPaths(directory) {
  const result = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    const entries = await fs.readdir(current, { withFileTypes: true }).catch((error) => {
      throw new Error(`Unable to inspect release directory ${current}: ${error.message}`);
    });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      result.push(entryPath);
      if (entry.isDirectory() && !entry.name.endsWith(".app")) pending.push(entryPath);
    }
  }
  return result;
}
