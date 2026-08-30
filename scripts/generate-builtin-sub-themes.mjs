#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileThemeCss } from "../electron/main/themes/theme-css-compiler.mjs";
import { parseSingleFileThemeCss } from "../electron/main/themes/theme-single-file-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = path.join(repoRoot, "sub-themes");
const outputPath = path.join(
  repoRoot,
  "src/features/themes/builtinSubThemes.generated.ts",
);
const rootThemeManifestPath = path.join(
  repoRoot,
  "src/features/appearance/interface-style-manifest.json",
);
const checkOnly = process.argv.includes("--check");

try {
  const definitions = await buildDefinitions();
  const expected = renderRegistry(definitions);
  if (checkOnly) {
    const current = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : null;
    if (current !== expected) {
      console.error("Built-in Sub Theme registry is stale.");
      console.error("Run npm run generate:sub-themes and commit the generated registry.");
      process.exit(1);
    }
    console.log(`Built-in Sub Theme packages are valid (${definitions.length} packages).`);
  } else {
    writeFileSync(outputPath, expected);
    console.log(`Generated ${path.relative(repoRoot, outputPath)} from ${definitions.length} packages.`);
  }
} catch (error) {
  console.error(`Built-in Sub Theme generation failed: ${formatError(error)}`);
  process.exit(1);
}

async function buildDefinitions() {
  if (!existsSync(packagesRoot)) fail("sub-themes/ does not exist.");
  const rootThemeManifest = JSON.parse(readFileSync(rootThemeManifestPath, "utf8"));
  const rootThemes = new Map(rootThemeManifest.styles.map((definition) => [definition.id, definition]));
  const entries = readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.name !== ".DS_Store")
    .sort((left, right) => left.name.localeCompare(right.name));
  if (entries.length === 0) fail("sub-themes/ must contain at least one package directory.");

  const definitions = [];
  const ids = new Set();
  const orders = new Set();
  for (const entry of entries) {
    if (!entry.isDirectory()) fail(`sub-themes/${entry.name} must be a package directory.`);
    const packageDirectory = path.join(packagesRoot, entry.name);
    const packageFiles = readdirSync(packageDirectory, { withFileTypes: true })
      .filter((candidate) => candidate.name !== ".DS_Store");
    if (
      packageFiles.length !== 1
      || !packageFiles[0].isFile()
      || packageFiles[0].name !== "theme.css"
    ) {
      fail(`sub-themes/${entry.name} must contain exactly one theme.css file.`);
    }

    const themePath = path.join(packageDirectory, "theme.css");
    const relativeThemePath = path.relative(repoRoot, themePath).split(path.sep).join("/");
    const parsed = parseSingleFileThemeCss(readFileSync(themePath, "utf8"), {
      sourcePath: relativeThemePath,
      allowReservedBuiltinId: true,
      allowBuiltinCompatibilityMetadata: true,
    });
    if (!parsed) fail(`${relativeThemePath} must declare @puppyone-theme metadata.`);
    if (entry.name !== parsed.id.replaceAll(".", "-")) {
      fail(`${relativeThemePath} id ${parsed.id} does not match package directory ${entry.name}.`);
    }
    if (ids.has(parsed.id)) fail(`Duplicate built-in Sub Theme id: ${parsed.id}.`);
    ids.add(parsed.id);
    if (parsed.builtinOrder === undefined) {
      fail(`${relativeThemePath} must declare builtin-order.`);
    }
    if (orders.has(parsed.builtinOrder)) {
      fail(`Duplicate built-in Sub Theme order: ${parsed.builtinOrder}.`);
    }
    orders.add(parsed.builtinOrder);
    validateRootCompatibility(parsed, rootThemes, relativeThemePath);

    const compiledCss = {};
    for (const target of parsed.targets) {
      const result = await compileThemeCss({
        css: parsed.stylesheets[target],
        themeId: parsed.id,
        target,
        sourcePath: relativeThemePath,
        allowReservedBuiltinId: true,
      });
      compiledCss[target] = result.css;
    }
    definitions.push({
      id: parsed.id,
      family: parsed.id.split(".").slice(0, -1).join("."),
      name: parsed.name,
      version: parsed.version,
      contractVersion: parsed.contractVersion,
      ...(parsed.author === undefined ? {} : { author: parsed.author }),
      compatibleRootThemeIds: [...parsed.compatibleRootThemeIds],
      modes: [...parsed.modes],
      targets: [...parsed.targets],
      source: "builtin",
      compiledCss,
      ...(parsed.legacyPresets === undefined
        ? {}
        : { legacyPresets: { ...parsed.legacyPresets } }),
      builtinOrder: parsed.builtinOrder,
    });
  }

  for (const rootTheme of rootThemes.values()) {
    const defaultSubTheme = definitions.find(
      (definition) => definition.id === rootTheme.subThemes.defaultSubThemeId,
    );
    if (!defaultSubTheme) {
      fail(`Root Theme ${rootTheme.id} default Sub Theme is missing: ${rootTheme.subThemes.defaultSubThemeId}.`);
    }
    if (!defaultSubTheme.compatibleRootThemeIds.includes(rootTheme.id)) {
      fail(`Root Theme ${rootTheme.id} default Sub Theme is not compatible with its owner.`);
    }
  }

  return definitions
    .sort((left, right) => left.builtinOrder - right.builtinOrder)
    .map(({ builtinOrder: _builtinOrder, ...definition }) => definition);
}

function validateRootCompatibility(theme, rootThemes, relativeThemePath) {
  for (const rootThemeId of theme.compatibleRootThemeIds) {
    const rootTheme = rootThemes.get(rootThemeId);
    if (!rootTheme) {
      fail(`${relativeThemePath} references unknown Root Theme ${rootThemeId}.`);
    }
    for (const target of rootTheme.subThemes.allowedTargets) {
      if (!theme.targets.includes(target)) {
        fail(`${relativeThemePath} must cover ${rootThemeId} target ${target}.`);
      }
    }
    const supportedModes = rootTheme.palette.kind === "fixed"
      ? [rootTheme.palette.mode]
      : rootTheme.palette.modes.includes("system")
        ? ["light", "dark"]
        : rootTheme.palette.modes;
    if (!theme.modes.some((mode) => supportedModes.includes(mode))) {
      fail(`${relativeThemePath} has no Color Mode supported by Root Theme ${rootThemeId}.`);
    }
  }
}

function renderRegistry(definitions) {
  const rows = definitions.map((definition) => renderDefinition(definition, "  ")).join(",\n");
  return [
    "/* This file is generated by scripts/generate-builtin-sub-themes.mjs. */",
    "/* Edit sub-themes/<package>/theme.css, then run npm run generate:sub-themes. */",
    'import type { SubThemeDefinition } from "./themeTypes";',
    "",
    "export const GENERATED_BUILTIN_SUB_THEMES: readonly SubThemeDefinition[] = Object.freeze([",
    rows,
    "]);",
    "",
  ].join("\n");
}

function renderDefinition(definition, indent) {
  const properties = [
    `id: ${quote(definition.id)}`,
    `family: ${quote(definition.family)}`,
    `name: ${quote(definition.name)}`,
    `version: ${quote(definition.version)}`,
    `contractVersion: ${definition.contractVersion}`,
    ...(definition.author === undefined ? [] : [`author: ${quote(definition.author)}`]),
    `compatibleRootThemeIds: Object.freeze(${JSON.stringify(definition.compatibleRootThemeIds)} as const)`,
    `modes: Object.freeze(${JSON.stringify(definition.modes)} as const)`,
    `targets: Object.freeze(${JSON.stringify(definition.targets)} as const)`,
    'source: "builtin"',
    `compiledCss: Object.freeze(${JSON.stringify(definition.compiledCss, null, 2).replaceAll("\n", `\n${indent}  `)})`,
    ...(definition.legacyPresets === undefined
      ? []
      : [`legacyPresets: Object.freeze(${JSON.stringify(definition.legacyPresets)})`]),
  ];
  return [
    `${indent}Object.freeze({`,
    ...properties.map((property) => `${indent}  ${property},`),
    `${indent}})`,
  ].join("\n");
}

function quote(value) {
  return JSON.stringify(value);
}

function fail(message) {
  throw new TypeError(message);
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
