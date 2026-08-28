import postcss from "postcss";
import path from "node:path";
import { THEME_TARGETS } from "./theme-package-contract.mjs";

const targetSet = new Set(THEME_TARGETS);
const themeIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,}$/;
const allowedContainerAtRules = new Set(["media", "supports"]);
const allowedDataUrlPattern = /^data:(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|font\/(?:woff2?|ttf|otf));/i;
const rootAliases = [".theme-root", ":root", "html", "body", "#write"];

export async function compileThemeCss({
  css,
  themeId,
  target,
  sourcePath = "theme.css",
  loadImport,
  resolveAssetUrl,
}) {
  if (typeof css !== "string") throw new TypeError("Theme CSS must be a string.");
  if (!themeIdPattern.test(themeId)) throw new TypeError("Theme id is invalid.");
  if (!targetSet.has(target)) throw new TypeError(`Unsupported theme target: ${String(target)}.`);

  const root = await parseAndInlineImports(css, {
    sourcePath,
    loadImport,
    ancestry: [],
    depth: 0,
  });
  validateAtRules(root);
  scopeRules(root, { themeId, target });
  await rewriteAssetUrls(root, resolveAssetUrl);
  validateDeclarations(root, target);

  return Object.freeze({
    css: root.toString().trim(),
    target,
    themeId,
  });
}

async function parseAndInlineImports(css, { sourcePath, loadImport, ancestry, depth }) {
  if (depth > 8) throw new TypeError("Theme CSS import depth exceeds the supported limit.");
  let root;
  try {
    root = postcss.parse(css, { from: sourcePath });
  } catch (error) {
    throw new TypeError(`Theme CSS could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const imports = [];
  root.walkAtRules("import", (rule) => imports.push(rule));
  for (const rule of imports) {
    const specifier = parseImportSpecifier(rule.params);
    if (!specifier || !isSafeRelativePath(specifier) || !specifier.toLowerCase().endsWith(".css")) {
      throw new TypeError("Theme CSS imports must reference a package-local CSS file.");
    }
    if (ancestry.includes(specifier)) throw new TypeError(`Theme CSS import cycle detected at ${specifier}.`);
    if (typeof loadImport !== "function") {
      throw new TypeError(`Theme CSS import cannot be loaded: ${specifier}.`);
    }
    const imported = await loadImport(specifier, sourcePath);
    const importedCss = typeof imported === "string" ? imported : imported?.css;
    const importedSourcePath = typeof imported === "string" ? specifier : imported?.sourcePath;
    if (typeof importedCss !== "string" || typeof importedSourcePath !== "string") {
      throw new TypeError(`Theme CSS import did not return text: ${specifier}.`);
    }
    const importedRoot = await parseAndInlineImports(importedCss, {
      sourcePath: importedSourcePath,
      loadImport,
      ancestry: [...ancestry, importedSourcePath],
      depth: depth + 1,
    });
    rule.replaceWith(...importedRoot.nodes.map((node) => node.clone()));
  }
  return root;
}

function validateAtRules(root) {
  root.walkAtRules((rule) => {
    const name = rule.name.toLowerCase();
    if (name === "font-face" || allowedContainerAtRules.has(name)) return;
    throw new TypeError(`Unsupported theme CSS at-rule: @${rule.name}.`);
  });
}

function scopeRules(root, { themeId, target }) {
  const host = `:where([data-po-theme-surface="${target}"][data-po-theme-id="${themeId}"])`;
  root.walkRules((rule) => {
    const selectors = splitSelectors(rule.selector);
    const scoped = selectors.map((selector) => scopeSelector(selector, host));
    if (target === "application") {
      const rootOnly = selectors.every((selector) => isRootOnlySelector(selector));
      if (!rootOnly) {
        throw new TypeError("Application themes may only declare root-level --po-* tokens.");
      }
    }
    rule.selector = scoped.join(", ");
  });
}

function scopeSelector(selector, host) {
  const normalized = selector.trim();
  if (!normalized) throw new TypeError("Theme CSS contains an empty selector.");
  if (normalized.includes(":global(") || normalized.includes(":host") || normalized.includes("::part")) {
    throw new TypeError(`Theme CSS selector can escape its surface: ${normalized}.`);
  }

  const alias = rootAliases.find((candidate) => startsWithSelectorToken(normalized, candidate));
  if (!alias) {
    if (containsRootAlias(normalized)) {
      throw new TypeError(`Theme CSS root aliases must start the selector: ${normalized}.`);
    }
    return `${host} ${normalized}`;
  }

  const suffix = normalized.slice(alias.length);
  if (containsRootAlias(suffix)) {
    throw new TypeError(`Theme CSS selector contains more than one root alias: ${normalized}.`);
  }
  return `${host}${suffix}`;
}

async function rewriteAssetUrls(root, resolveAssetUrl) {
  const declarations = [];
  root.walkDecls((declaration) => declarations.push(declaration));
  for (const declaration of declarations) {
    declaration.value = await replaceUrls(declaration.value, async (specifier) => {
      if (specifier.startsWith("data:")) {
        if (!allowedDataUrlPattern.test(specifier) || specifier.length > 512_000) {
          throw new TypeError("Theme CSS data URLs must be bounded image or font assets.");
        }
        return specifier;
      }
      if (!isSafeRelativePath(specifier)) {
        throw new TypeError(`Theme CSS cannot load external asset URL: ${specifier}.`);
      }
      if (typeof resolveAssetUrl !== "function") {
        throw new TypeError(`Theme CSS asset cannot be resolved: ${specifier}.`);
      }
      const resolved = await resolveAssetUrl(
        specifier,
        normalizeSourcePath(declaration.source?.input?.file ?? "theme.css"),
      );
      if (typeof resolved !== "string" || !allowedDataUrlPattern.test(resolved)) {
        throw new TypeError(`Theme CSS asset resolver returned an unsupported URL for ${specifier}.`);
      }
      return resolved;
    });
  }
}

function normalizeSourcePath(value) {
  const normalized = path.isAbsolute(value) ? path.relative(process.cwd(), value) : value;
  return normalized.split(path.sep).join("/");
}

function validateDeclarations(root, target) {
  root.walkDecls((declaration) => {
    const property = declaration.prop.toLowerCase();
    const value = declaration.value.trim().toLowerCase();
    if (target === "application" && !property.startsWith("--po-")) {
      throw new TypeError("Application themes may only declare root-level --po-* tokens.");
    }
    if (property === "position" && value === "fixed") {
      throw new TypeError("Theme CSS cannot use fixed positioning.");
    }
    if (value.includes("expression(") || value.includes("-moz-binding")) {
      throw new TypeError("Theme CSS contains an unsupported executable value.");
    }
  });
}

function parseImportSpecifier(params) {
  const match = params.trim().match(/^(?:"([^"]+)"|'([^']+)')$/);
  return match ? match[1] ?? match[2] : null;
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 240) return false;
  if (value.includes("\\") || value.startsWith("/") || value.startsWith("~")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  const normalized = value.startsWith("./") ? value.slice(2) : value;
  const segments = normalized.split("/");
  return segments.every((segment) => segment.length > 0);
}

function startsWithSelectorToken(selector, token) {
  if (!selector.startsWith(token)) return false;
  const next = selector[token.length];
  return next === undefined || /[\s>+~:.#[\]]/.test(next);
}

function containsRootAlias(selector) {
  return rootAliases.some((alias) => {
    const index = selector.indexOf(alias);
    if (index < 0) return false;
    const previous = selector[index - 1];
    const next = selector[index + alias.length];
    const leftBoundary = previous === undefined || /[\s>+~,(]/.test(previous);
    const rightBoundary = next === undefined || /[\s>+~:.#[\],)]/.test(next);
    return leftBoundary && rightBoundary;
  });
}

function isRootOnlySelector(selector) {
  const normalized = selector.trim();
  return rootAliases.some((alias) => normalized === alias);
}

function splitSelectors(value) {
  const selectors = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    else if (character === "," && depth === 0) {
      selectors.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  selectors.push(value.slice(start).trim());
  return selectors;
}

async function replaceUrls(value, replace) {
  const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;
  const matches = [...value.matchAll(pattern)];
  if (matches.length === 0) return value;
  let result = "";
  let offset = 0;
  for (const match of matches) {
    const index = match.index ?? 0;
    const specifier = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    const resolved = await replace(specifier);
    result += value.slice(offset, index);
    result += `url("${resolved.replaceAll('"', "\\\"")}")`;
    offset = index + match[0].length;
  }
  return result + value.slice(offset);
}
