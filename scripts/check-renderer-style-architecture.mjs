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

if (cascade.trim() !== "@layer reset, tokens, primitives, patterns, features, overrides;") {
  errors.push("Renderer cascade order must remain reset → tokens → primitives → patterns → features → overrides.");
}

const cascadeIndex = rendererEntry.indexOf('import "./styles/cascade.css";');
const tailwindIndex = rendererEntry.indexOf('import "./cloud-globals.css";');
const sharedIndex = rendererEntry.indexOf('import "@puppyone/shared-ui/shared-ui.css";');
const productIndex = rendererEntry.indexOf('import "./styles.css";');
if (
  cascadeIndex < 0
  || tailwindIndex < 0
  || sharedIndex < 0
  || productIndex < 0
  || !(cascadeIndex < tailwindIndex && tailwindIndex < sharedIndex && sharedIndex < productIndex)
) {
  errors.push("Renderer styles must load cascade registration, Tailwind utilities, Shared UI, then product styles.");
}

if (!/corePlugins\s*:\s*\{[\s\S]*?preflight\s*:\s*false/.test(tailwindConfig)) {
  errors.push("Tailwind Preflight must remain disabled; PuppyOne's reset layer is the only renderer reset owner.");
}

if (!productStyles.includes('@import "./styles/base.css" layer(reset);')) {
  errors.push("The PuppyOne base stylesheet must remain explicitly owned by the reset layer.");
}

const expectedTailwindDirectives = ["@tailwind base;", "@tailwind components;", "@tailwind utilities;"];
for (const directive of expectedTailwindDirectives) {
  if (!tailwindEntry.includes(directive)) errors.push(`Tailwind entry is missing ${directive}`);
}

for (const filePath of walkCss(path.join(repoRoot, "src"))) {
  const relativePath = path.relative(repoRoot, filePath);
  if (relativePath === path.join("src", "cloud-globals.css")) continue;
  if (/^\s*@tailwind\s+(?:base|components|utilities)\s*;/m.test(readAbsolute(filePath))) {
    errors.push(`${relativePath} declares Tailwind globally; src/cloud-globals.css is the single entry owner.`);
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
  return readFileSync(filePath, "utf8");
}

function walkCss(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkCss(filePath);
    return statSync(filePath).isFile() && filePath.endsWith(".css") ? [filePath] : [];
  });
}
