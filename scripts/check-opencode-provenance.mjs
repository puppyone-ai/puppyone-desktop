import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = readJson("vendor/opencode/runtime-manifest.json");
const prompts = readJson("vendor/opencode/PROMPT_MANIFEST.json");
const sbom = readJson("vendor/opencode/SBOM.cdx.json");
const packageManifest = readJson("package.json");
const packageLock = readJson("package-lock.json");
const notice = await fs.promises.readFile(path.join(root, "THIRD_PARTY_NOTICES.md"), "utf8");
const license = await fs.promises.readFile(path.join(root, "vendor/opencode/LICENSE"), "utf8");
const runtimeSource = await fs.promises.readFile(path.join(root, "electron/main/agent/runtimes/opencode/opencode-manifest.mjs"), "utf8");
const gatewaySource = await fs.promises.readFile(path.join(root, "electron/main/agent/runtimes/opencode/opencode-http-client.mjs"), "utf8");

assert(runtime.runtimeRelease.version === "1.17.18", "OpenCode runtime version drifted.");
assert(packageManifest.dependencies?.["@opencode-ai/sdk"] === runtime.runtimeRelease.version, "OpenCode SDK must exactly match the bundled runtime.");
assert(packageLock.packages?.["node_modules/@opencode-ai/sdk"]?.version === runtime.runtimeRelease.version, "OpenCode SDK lockfile version drifted.");
assert(gatewaySource.includes('from "@opencode-ai/sdk/v2/client"'), "OpenCode gateway must use the client-only SDK entrypoint.");
assert(!gatewaySource.includes("@opencode-ai/sdk/server"), "OpenCode PATH-spawning SDK server helper is forbidden.");
assert(runtime.protocolFloor === runtime.runtimeRelease.version, "Unverified older OpenCode protocol floor is not allowed.");
assert(/^[a-f0-9]{40}$/.test(runtime.runtimeRelease.releaseCommit), "OpenCode release commit is invalid.");
assert(Object.keys(runtime.artifacts).length === 6, "OpenCode release artifact matrix is incomplete.");
for (const [platform, artifact] of Object.entries(runtime.artifacts)) {
  assert(/^[a-f0-9]{64}$/.test(artifact.sha256), `OpenCode ${platform} digest is invalid.`);
  assert(Number.isSafeInteger(artifact.bytes) && artifact.bytes > 1_000_000, `OpenCode ${platform} size is invalid.`);
}
assert(prompts.commit === runtime.runtimeRelease.releaseCommit, "OpenCode prompt manifest is not pinned to the executable release commit.");
assert(runtimeSource.includes(runtime.sourceAudit.commit), "Runtime source-audit pin differs from the provenance manifest.");
assert(runtimeSource.includes(runtime.runtimeRelease.releaseCommit), "Runtime release pin differs from the provenance manifest.");
assert(runtimeSource.includes(`protocolFloor: "${runtime.protocolFloor}"`), "Runtime protocol floor differs from the provenance manifest.");
const promptManifestSha256 = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "vendor/opencode/PROMPT_MANIFEST.json"))).digest("hex");
assert(runtimeSource.includes(promptManifestSha256), "Runtime session metadata prompt-manifest hash drifted.");
assert(Object.keys(prompts.files).length === 18, "OpenCode prompt manifest is incomplete.");
for (const [filename, digest] of Object.entries(prompts.files)) {
  assert(filename.endsWith(".txt") && /^[a-f0-9]{64}$/.test(digest), `Invalid prompt manifest entry: ${filename}`);
}
assert(notice.includes(runtime.sourceAudit.commit) && notice.includes("MIT License"), "OpenCode third-party notice is incomplete.");
assert(license.includes("Copyright (c) 2025 opencode"), "OpenCode MIT license is incomplete.");
assert(sbom.bomFormat === "CycloneDX" && sbom.components?.[0]?.version === runtime.runtimeRelease.version, "OpenCode SBOM is missing or drifted.");
assert(sbom.components?.some((component) => component.purl === `pkg:npm/%40opencode-ai/sdk@${runtime.runtimeRelease.version}`), "OpenCode SDK is missing from the SBOM.");

const upstreamRoot = process.argv[2] || process.env.PUPPYONE_OPENCODE_SOURCE;
if (upstreamRoot) {
  for (const [filename, expected] of Object.entries(prompts.files)) {
    const bytes = await fs.promises.readFile(path.join(path.resolve(upstreamRoot), filename));
    const actual = crypto.createHash("sha256").update(bytes).digest("hex");
    assert(actual === expected, `OpenCode prompt drift: ${filename}`);
  }
}

const rendererFiles = await collectFiles(path.join(root, "src"));
for (const filename of rendererFiles.filter((entry) => /\.(ts|tsx)$/.test(entry))) {
  const source = await fs.promises.readFile(filename, "utf8");
  assert(!/OPENCODE_SERVER_(?:USERNAME|PASSWORD)|OpenCodeHttpClient|\/global\/event/.test(source), `Renderer contains OpenCode sidecar credentials or transport: ${path.relative(root, filename)}`);
}
process.stdout.write("OpenCode provenance and trust-boundary check passed.\n");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

async function collectFiles(directory) {
  const output = [];
  for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collectFiles(filename));
    else output.push(filename);
  }
  return output;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
