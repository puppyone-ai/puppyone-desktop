import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDefaultElectronBin, getElectronRuntimeEnv } from "./electron-runtime.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const electronExecutable = getDefaultElectronBin(desktopRoot);
const electronArgs = [".", ...process.argv.slice(2)];

const electron = spawn(electronExecutable, electronArgs, {
  cwd: desktopRoot,
  stdio: "inherit",
  env: getElectronRuntimeEnv(),
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!electron.killed) electron.kill(signal);
  });
}

electron.on("exit", (code) => {
  process.exit(code ?? 0);
});
