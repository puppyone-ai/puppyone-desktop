#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDesktopBuildIdentity } from "../shared/desktop-build-identity.mjs";
import { createDesktopElectronBuilderConfig } from "../tooling/desktop/build/create-builder-config.mjs";
import { getDesktopTargetDefinition } from "../tooling/desktop/targets/target-manifest.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeBrandDirectory = "assets/brand/puppy";
const rendererBrandDirectory = "public/assets/brand/puppy";
const canonicalAssets = Object.freeze({
  appImage: `${nativeBrandDirectory}/puppy-app-image.png`,
  appImageDev: `${nativeBrandDirectory}/puppy-app-image-dev.png`,
  dark: `${rendererBrandDirectory}/puppy-dark.svg`,
  lite: `${rendererBrandDirectory}/puppy-lite.svg`,
});
const expectedDirectoryContents = new Map([
  [nativeBrandDirectory, ["puppy-app-image-dev.png", "puppy-app-image.png"]],
  [rendererBrandDirectory, ["puppy-dark.svg", "puppy-lite.svg"]],
]);
const retiredAliases = [
  "public/PuppyAgentLOGO.png",
  "public/app-icon.svg",
  "public/icons/puppyone.ico",
  "public/logo-square.png",
  "public/logo-square-dev.png",
  "public/logo-square-v0.1.3-dark.png",
  "public/logo-square-v0.1.3-dark-dev.png",
  "public/logo-square-v0.1.3-light.png",
  "public/logo-square-v0.1.3-light-dev.png",
  "public/assets/brand/puppyone-onboarding-light.svg",
  "public/assets/brand/puppyone-xp.svg",
  "public/onboarding-folder-logo.svg",
  "public/puppybase.svg",
  "public/puppyone-icon.png",
  "public/puppyone-logo.png",
  "public/puppyone-logo.svg",
  "public/puppyone-mark.svg",
  "public/puppyone.svg",
  "public/puppyonetitle.png",
];
const errors = [];

for (const [directory, expectedFiles] of expectedDirectoryContents) {
  const directoryPath = path.join(repoRoot, directory);
  const actualFiles = existsSync(directoryPath)
    ? readdirSync(directoryPath).sort()
    : [];
  if (JSON.stringify(actualFiles) !== JSON.stringify([...expectedFiles].sort())) {
    errors.push(`${directory} must contain only: ${expectedFiles.join(", ")}`);
  }
}

const assetBuffers = new Map();
for (const [role, relativePath] of Object.entries(canonicalAssets)) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    errors.push(`missing canonical ${role} asset: ${relativePath}`);
    continue;
  }
  const contents = readFileSync(absolutePath);
  assetBuffers.set(role, contents);
  if (relativePath.endsWith(".png")) {
    const dimensions = readPngDimensions(contents);
    if (dimensions?.width !== 1024 || dimensions?.height !== 1024) {
      errors.push(`${relativePath} must be a 1024 x 1024 PNG`);
    }
  } else if (!isSafeProductMarkSvg(contents)) {
    errors.push(`${relativePath} must be a self-contained 600 x 600 SVG`);
  }
}

for (const legacyPath of retiredAliases) {
  if (existsSync(path.join(repoRoot, legacyPath))) {
    errors.push(`retired Puppy logo alias must not exist: ${legacyPath}`);
  }
}

const appImage = assetBuffers.get("appImage");
if (appImage?.equals(assetBuffers.get("appImageDev"))) {
  errors.push("Development App Image must remain visibly badged");
}
for (const rendererRole of ["dark", "lite"]) {
  if (appImage?.equals(assetBuffers.get(rendererRole))) {
    errors.push(`native App Image must remain visually distinct from Puppy ${rendererRole}`);
  }
  if (assetBuffers.get("appImageDev")?.equals(assetBuffers.get(rendererRole))) {
    errors.push(`Development App Image must remain visually distinct from Puppy ${rendererRole}`);
  }
}
if (assetBuffers.get("dark")?.equals(assetBuffers.get("lite"))) {
  errors.push("Puppy Dark and Puppy Lite must remain distinct renderer assets");
}

const packageMetadata = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const stableMacConfig = createDesktopElectronBuilderConfig({
  packageMetadata,
  buildInfo: resolveDesktopBuildIdentity({
    baseVersion: packageMetadata.version,
    buildNumber: 1,
    builtAt: "2026-01-01T00:00:00.000Z",
    channel: "stable",
    commitSha: "a".repeat(40),
  }),
  target: getDesktopTargetDefinition("macos-arm64"),
});
if (stableMacConfig.mac?.icon !== canonicalAssets.appImage) {
  errors.push(`electron-builder mac.icon must be ${canonicalAssets.appImage}`);
}
const canonicalExtraResource = stableMacConfig.extraResources?.find((entry) => (
  entry?.to === "puppy-app-image.png"
));
if (canonicalExtraResource?.from !== canonicalAssets.appImage) {
  errors.push("electron-builder must copy the canonical App Image to puppy-app-image.png");
}

if (errors.length > 0) {
  console.error("Puppy brand asset check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Puppy brand asset check passed: two native App Images and two renderer marks.");

function readPngDimensions(contents) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contents.length < 24 || !contents.subarray(0, 8).equals(signature)) return null;
  return {
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
  };
}

function isSafeProductMarkSvg(contents) {
  const source = contents.toString("utf8");
  const root = source.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  return /\bwidth="600"/.test(root)
    && /\bheight="600"/.test(root)
    && /\bviewBox="0 0 600 600"/.test(root)
    && !/<(?:script|foreignObject)\b/i.test(source)
    && !/\b(?:href|xlink:href)\s*=/i.test(source);
}
