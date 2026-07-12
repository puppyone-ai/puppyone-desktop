import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoots = ["electron", "local-api", "shared", "scripts"];
const runtimeExtensions = new Set([".mjs", ".cjs", ".js"]);
const files = runtimeRoots.flatMap((relative) => collect(path.join(root, relative)));
const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status === 0) continue;
  failures.push(`${path.relative(root, file)}\n${result.stderr || result.stdout}`.trim());
}

if (failures.length) {
  console.error(`Runtime syntax check failed for ${failures.length} file(s):\n${failures.join("\n\n")}`);
  process.exit(1);
}

console.log(`Runtime syntax check passed (${files.length} files).`);

function collect(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collect(file));
    } else if (runtimeExtensions.has(path.extname(entry.name))) {
      files.push(file);
    }
  }
  return files;
}
