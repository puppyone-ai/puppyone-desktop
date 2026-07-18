#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(
  repoRoot,
  "src/features/appearance/interface-style-manifest.json",
);
const THEME_MODES = new Set(["system", "light", "dark"]);
const checkOnly = process.argv.includes("--check");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

validateManifest(manifest);
validateSkinContract(manifest);

const outputs = new Map([
  [
    path.join(repoRoot, "src/features/appearance/interfaceStyles.generated.ts"),
    renderTypeScriptManifest(manifest),
  ],
  [
    path.join(repoRoot, "public/interface-style-bootstrap.js"),
    renderBootstrapManifest(manifest),
  ],
  [
    path.join(repoRoot, "src/styles/interface-styles.generated.css"),
    renderStylesheetEntry(manifest),
  ],
]);

const staleOutputs = [];
for (const [outputPath, expected] of outputs) {
  if (checkOnly) {
    const current = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : null;
    if (current !== expected) staleOutputs.push(path.relative(repoRoot, outputPath));
    continue;
  }
  writeFileSync(outputPath, expected);
  console.log(`Generated ${path.relative(repoRoot, outputPath)}`);
}

if (staleOutputs.length > 0) {
  console.error("Interface style generated files are stale:");
  for (const output of staleOutputs) console.error(`- ${output}`);
  console.error("Run npm run generate:interface-styles and commit the results.");
  process.exit(1);
}

if (checkOnly) console.log("Interface style manifest and generated files are in sync.");

function validateManifest(value) {
  if (value?.version !== 1) fail("manifest version must be 1");
  if (!isNonEmptyString(value?.defaultStyle)) fail("defaultStyle must be a non-empty string");
  if (!isNonEmptyString(value?.storage?.interfaceStyle)) fail("storage.interfaceStyle is required");
  if (!isNonEmptyString(value?.storage?.themeMode)) fail("storage.themeMode is required");
  if (!Array.isArray(value?.styles) || value.styles.length === 0) fail("styles must be a non-empty array");

  const ids = new Set();
  for (const style of value.styles) {
    if (!isNonEmptyString(style?.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(style.id)) {
      fail(`invalid style id: ${String(style?.id)}`);
    }
    if (ids.has(style.id)) fail(`duplicate style id: ${style.id}`);
    ids.add(style.id);
    if (!isNonEmptyString(style.labelKey)) fail(`${style.id}.labelKey is required`);

    const palette = style.palette;
    if (palette?.kind === "fixed") {
      if (palette.mode !== "light" && palette.mode !== "dark") {
        fail(`${style.id}.palette.mode must be light or dark`);
      }
      validateFirstPaint(style, [palette.mode]);
    } else if (palette?.kind === "adaptive") {
      if (!Array.isArray(palette.modes) || palette.modes.length === 0) {
        fail(`${style.id}.palette.modes must be non-empty`);
      }
      const modes = new Set(palette.modes);
      if (modes.size !== palette.modes.length) fail(`${style.id}.palette.modes contains duplicates`);
      for (const mode of modes) {
        if (!THEME_MODES.has(mode)) fail(`${style.id}.palette.modes contains ${String(mode)}`);
      }
      if (!modes.has(palette.fallbackMode)) {
        fail(`${style.id}.palette.fallbackMode must be one of its modes`);
      }
      if (typeof palette.presetControls?.light !== "boolean" || typeof palette.presetControls?.dark !== "boolean") {
        fail(`${style.id}.palette.presetControls must declare light and dark booleans`);
      }
      validateFirstPaint(style, modes.has("system") ? ["light", "dark"] : [...modes]);
    } else {
      fail(`${style.id}.palette.kind must be adaptive or fixed`);
    }

    if (style.stylesheet !== null) {
      if (!isNonEmptyString(style.stylesheet) || path.basename(style.stylesheet) !== style.stylesheet || !style.stylesheet.endsWith(".css")) {
        fail(`${style.id}.stylesheet must be null or a CSS basename`);
      }
      const stylesheetPath = path.join(repoRoot, "src/styles", style.stylesheet);
      if (!existsSync(stylesheetPath)) fail(`${style.id}.stylesheet does not exist: ${style.stylesheet}`);
    }
  }

  if (!ids.has(value.defaultStyle)) fail("defaultStyle must reference a registered style");
}

function validateFirstPaint(style, requiredModes) {
  for (const mode of requiredModes) {
    if (mode === "system") continue;
    const paint = style.firstPaint?.[mode];
    if (!isNonEmptyString(paint?.background)) fail(`${style.id}.firstPaint.${mode}.background is required`);
    if (paint?.colorScheme !== mode) fail(`${style.id}.firstPaint.${mode}.colorScheme must be ${mode}`);
  }
}

function validateSkinContract(value) {
  const contractPath = path.join(repoRoot, "src/styles/interface-skin-contract.css");
  const contractSource = readFileSync(contractPath, "utf8");
  const requiredTokens = new Set(
    [...contractSource.matchAll(/var\((--interface-[a-z0-9-]+)/g)].map((match) => match[1]),
  );
  if (requiredTokens.size === 0) fail("interface-skin-contract.css does not expose any interface tokens");

  for (const style of value.styles) {
    if (style.stylesheet === null) continue;
    const stylesheetPath = path.join(repoRoot, "src/styles", style.stylesheet);
    const source = readFileSync(stylesheetPath, "utf8");
    if (!source.includes(`:root[data-interface-style="${style.id}"]`)) {
      fail(`${style.stylesheet} does not scope itself to ${style.id}`);
    }
    const missingTokens = [...requiredTokens].filter((token) => !source.includes(`${token}:`));
    if (missingTokens.length > 0) {
      fail(`${style.stylesheet} is missing contract tokens: ${missingTokens.join(", ")}`);
    }
  }
}

function renderTypeScriptManifest(value) {
  return `/* This file is generated by scripts/generate-interface-styles.mjs. */\n\nexport const INTERFACE_STYLE_MANIFEST = ${JSON.stringify(value, null, 2)} as const;\n`;
}

function renderBootstrapManifest(value) {
  return `/* This file is generated by scripts/generate-interface-styles.mjs. */\nwindow.__PUPPYONE_INTERFACE_STYLE_MANIFEST__ = ${JSON.stringify(value)};\n`;
}

function renderStylesheetEntry(value) {
  const imports = ["interface-skin-contract.css", ...value.styles.flatMap((style) => (
    style.stylesheet ? [style.stylesheet] : []
  ))];
  return [
    "/* This file is generated by scripts/generate-interface-styles.mjs. */",
    ...imports.map((stylesheet) => `@import "./${stylesheet}";`),
    "",
  ].join("\n");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function fail(message) {
  throw new Error(`Invalid interface style manifest: ${message}`);
}
