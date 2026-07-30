#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const cascade = read("src/styles/cascade.css");
const rendererEntry = read("src/main.tsx");
const productStyles = read("src/styles.css");
const tailwindEntry = read("src/cloud-globals.css");
const tailwindConfig = read("tailwind.config.cjs");
const windowChromeStyles = read("src/styles/window-chrome.css");
const windowChromeOwner = path.join(repoRoot, "src", "styles", "window-chrome.css");

if (cascade.trim() !== "@layer reset, tokens, primitives, patterns, features, overrides;") {
  errors.push("Renderer cascade order must remain reset → tokens → primitives → patterns → features → overrides.");
}

const cascadeIndex = rendererEntry.indexOf('import "./styles/cascade.css";');
const tailwindIndex = rendererEntry.indexOf('import "./cloud-globals.css";');
const sharedIndex = rendererEntry.indexOf('import "@puppyone/shared-ui/shared-ui.css";');
const productIndex = rendererEntry.indexOf('import "./styles.css";');
const rendererStyleBootstrap = [
  'import "./styles/cascade.css";',
  'import "./cloud-globals.css";',
  'import "@puppyone/shared-ui/shared-ui.css";',
  'import "./styles.css";',
].join("\n");
if (
  cascadeIndex < 0
  || tailwindIndex < 0
  || sharedIndex < 0
  || productIndex < 0
  || !rendererEntry.startsWith(`${rendererStyleBootstrap}\n`)
  || !(cascadeIndex < tailwindIndex && tailwindIndex < sharedIndex && sharedIndex < productIndex)
) {
  errors.push("Renderer styles must be the first side-effect imports and load cascade registration, Tailwind utilities, Shared UI, then product styles before application modules.");
}

if (!/corePlugins\s*:\s*\{[\s\S]*?preflight\s*:\s*false/.test(tailwindConfig)) {
  errors.push("Tailwind Preflight must remain disabled; PuppyOne's reset layer is the only renderer reset owner.");
}

if (!productStyles.includes('@import "./styles/base.css" layer(reset);')) {
  errors.push("The PuppyOne base stylesheet must remain explicitly owned by the reset layer.");
}

if (!productStyles.includes('@import "./styles/window-chrome.css";')) {
  errors.push("Desktop product styles must load the dedicated native window chrome contract.");
}

if (
  !windowChromeStyles.includes('[data-window-drag-region="true"]')
  || !windowChromeStyles.includes("-webkit-app-region: drag;")
  || !windowChromeStyles.includes('[data-window-no-drag="true"]')
  || !windowChromeStyles.includes("-webkit-app-region: no-drag;")
) {
  errors.push("Window chrome styles must own explicit drag and no-drag data-attribute contracts.");
}

const expectedTailwindDirectives = ["@tailwind base;", "@tailwind components;", "@tailwind utilities;"];
for (const directive of expectedTailwindDirectives) {
  if (!tailwindEntry.includes(directive)) errors.push(`Tailwind entry is missing ${directive}`);
}

const rendererSourceRoots = [
  path.join(repoRoot, "src"),
  path.join(repoRoot, "packages", "shared-ui", "src"),
];

for (const filePath of rendererSourceRoots.flatMap(walkRendererSource)) {
  const relativePath = path.relative(repoRoot, filePath);
  const source = readAbsolute(filePath);

  if (
    filePath.endsWith(".css")
    && relativePath !== path.join("src", "cloud-globals.css")
    && /^\s*@tailwind\s+(?:base|components|utilities)\s*;/m.test(source)
  ) {
    errors.push(`${relativePath} declares Tailwind globally; src/cloud-globals.css is the single entry owner.`);
  }

  if (
    filePath !== windowChromeOwner
    && /(?:-webkit-)?app-region\b|WebkitAppRegion|webkitAppRegion/.test(source)
  ) {
    errors.push(`${relativePath} declares native window hit testing; src/styles/window-chrome.css is the single owner.`);
  }
}

for (const filePath of walkRendererSource(path.join(repoRoot, "packages", "shared-ui", "src"))) {
  const source = readAbsolute(filePath);
  if (/data-window-(?:drag-region|no-drag)/.test(source)) {
    errors.push(`${path.relative(repoRoot, filePath)} leaks desktop native window behavior into Shared UI.`);
  }
}

if (errors.length > 0) {
  console.error("Renderer style architecture check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Renderer style architecture check passed.");

function read(relativePath) {
  return readAbsolute(path.join(repoRoot, relativePath));
}

function readAbsolute(filePath) {
  return readFileSync(filePath, "utf8").replace(/\r\n?/g, "\n");
}

function walkRendererSource(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkRendererSource(filePath);
    return statSync(filePath).isFile() && /\.(?:css|[cm]?[jt]sx?)$/.test(filePath) ? [filePath] : [];
  });
}
