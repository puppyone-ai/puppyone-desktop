import postcss from "postcss";
import { parseThemeManifest, THEME_TARGETS } from "./theme-package-contract.mjs";

const metadataProperties = new Set(["id", "name", "version", "author", "modes"]);
const targetSet = new Set(THEME_TARGETS);

export function parseSingleFileThemeCss(css, { sourcePath = "theme.css" } = {}) {
  if (typeof css !== "string") throw new TypeError("Theme CSS must be a string.");

  let root;
  try {
    root = postcss.parse(css, { from: sourcePath });
  } catch (error) {
    throw new TypeError(`Theme CSS could not be parsed: ${formatError(error)}`);
  }

  const metadataRules = root.nodes.filter(
    (node) => node.type === "atrule" && node.name.toLowerCase() === "puppyone-theme",
  );
  if (metadataRules.length === 0) return null;
  if (metadataRules.length > 1) {
    throw new TypeError("A single-file theme must contain exactly one @puppyone-theme block.");
  }

  const metadataRule = metadataRules[0];
  if (metadataRule.params.trim().length > 0 || !Array.isArray(metadataRule.nodes)) {
    throw new TypeError("@puppyone-theme must be a top-level declaration block.");
  }

  const targetRules = new Map();
  for (const node of root.nodes) {
    if (node.type === "comment") continue;
    if (node === metadataRule) continue;
    if (node.type === "atrule" && node.name.toLowerCase() === "charset") continue;
    if (node.type !== "atrule" || node.name.toLowerCase() !== "puppyone") {
      throw new TypeError("Coordinated theme CSS rules must be inside a top-level @puppyone target block.");
    }

    const target = node.params.trim().toLowerCase();
    if (!targetSet.has(target)) throw new TypeError(`Unsupported theme target: ${target || "(empty)"}.`);
    if (!Array.isArray(node.nodes)) {
      throw new TypeError(`@puppyone ${target} must be a top-level CSS block.`);
    }
    if (targetRules.has(target)) throw new TypeError(`Duplicate theme target: ${target}.`);
    targetRules.set(target, node);
  }

  root.walkAtRules((rule) => {
    const name = rule.name.toLowerCase();
    if ((name === "puppyone" || name === "puppyone-theme") && rule.parent !== root) {
      throw new TypeError("PuppyOne control blocks must be top-level.");
    }
  });

  const rawMetadata = parseMetadataDeclarations(metadataRule);
  const targets = THEME_TARGETS.filter((target) => targetRules.has(target));
  if (targets.length === 0) {
    throw new TypeError("A single-file theme must declare at least one target.");
  }
  const manifest = parseThemeManifest({
    schemaVersion: 1,
    ...rawMetadata,
    modes: rawMetadata.modes?.split(/\s+/).filter(Boolean),
    targets,
    entrypoints: Object.fromEntries(targets.map((target) => [target, `${target}.css`])),
  });

  const stylesheets = Object.freeze(Object.fromEntries(targets.map((target) => {
    const nodes = targetRules.get(target).nodes.map((node) => node.clone());
    return [target, postcss.root({ nodes }).toString().trim()];
  })));

  return Object.freeze({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    ...(manifest.author === undefined ? {} : { author: manifest.author }),
    modes: manifest.modes,
    targets: manifest.targets,
    stylesheets,
  });
}

function parseMetadataDeclarations(rule) {
  const metadata = {};
  for (const node of rule.nodes) {
    if (node.type === "comment") continue;
    if (node.type !== "decl") {
      throw new TypeError("@puppyone-theme may contain metadata declarations only.");
    }
    const property = node.prop.trim().toLowerCase();
    if (!metadataProperties.has(property)) {
      throw new TypeError(`Unsupported theme metadata property: ${property}.`);
    }
    if (Object.hasOwn(metadata, property)) {
      throw new TypeError(`Duplicate theme metadata property: ${property}.`);
    }
    metadata[property] = node.value.trim();
  }
  return metadata;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
