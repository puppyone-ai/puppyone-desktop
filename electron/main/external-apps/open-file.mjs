import { spawn } from "node:child_process";
import path from "node:path";
import { validateExternalApplicationPath } from "./bundle-metadata.mjs";

export function openFileWithExternalApplication({ appPath, filePath }) {
  const normalizedAppPath = validateExternalApplicationPath(appPath);

  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/open", ["-a", normalizedAppPath, filePath], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errorOutput = "";

    child.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(errorOutput.trim() || `Unable to open file with ${path.basename(normalizedAppPath)}.`));
    });
  });
}
