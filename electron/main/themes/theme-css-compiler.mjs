import postcss from "postcss";
import path from "node:path";
import { THEME_TARGETS } from "./theme-package-contract.mjs";

const targetSet = new Set(THEME_TARGETS);
const themeIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,}$/;
const managedCustomThemeId = "local.puppyone.custom-css";
const allowedContainerAtRules = new Set(["media", "supports"]);
const allowedDataUrlPattern = /^data:(?:image\/(?:png|jpeg|gif|webp|svg\+xml)|font\/(?:woff2?|ttf|otf));/i;
const rootAliases = [".theme-root", ":root", "html", "body", "#write"];
const applicationColorTokens = new Set([
  "--po-surface-canvas",
  "--po-surface-chrome",
  "--po-surface-panel",
  "--po-surface-panel-raised",
  "--po-surface-overlay",
  "--po-surface-inset",
  "--po-surface-editor",
  "--po-surface-terminal",
  "--po-canvas",
  "--po-chrome",
  "--po-panel",
  "--po-panel-raised",
  "--po-overlay",
  "--po-inset",
  "--po-header",
  "--po-sidebar",
  "--po-control",
  "--po-control-hover",
  "--po-text",
  "--po-text-muted",
  "--po-text-subtle",
  "--po-text-disabled",
  "--po-text-inverse",
  "--po-border",
  "--po-border-strong",
  "--po-border-subtle",
  "--po-divider",
  "--po-shell-divider",
  "--po-header-divider",
  "--po-sidebar-divider",
  "--po-hover",
  "--po-selected",
  "--po-active",
  "--po-accent",
  "--po-accent-text",
  "--po-focus-ring",
  "--po-danger",
  "--po-info",
  "--po-success",
  "--po-success-contrast",
  "--po-warning",
  "--po-notification",
  "--po-notification-text",
  "--po-backdrop",
  "--po-backdrop-strong",
  "--po-shadow",
]);

export async function compileThemeCss({
  css,
  themeId,
  target,
  scope = "theme",
  sourcePath = "theme.css",
  loadImport,
  resolveAssetUrl,
}) {
  if (typeof css !== "string") throw new TypeError("Theme CSS must be a string.");
  if (!themeIdPattern.test(themeId)) throw new TypeError("Theme id is invalid.");
  if (!targetSet.has(target)) throw new TypeError(`Unsupported theme target: ${String(target)}.`);
  if (scope !== "theme" && scope !== "surface-overlay") {
    throw new TypeError(`Unsupported theme CSS scope: ${String(scope)}.`);
  }
  if (scope === "surface-overlay" && themeId !== managedCustomThemeId) {
    throw new TypeError("Surface-overlay scope is reserved for managed Custom CSS.");
  }

  const root = await parseAndInlineImports(css, {
    sourcePath,
    loadImport,
    ancestry: [sourcePath],
    depth: 0,
  });
  root.walkAtRules("charset", (rule) => rule.remove());
  validateAtRules(root);
  scopeRules(root, { themeId, target, scope });
  await rewriteAssetUrls(root, resolveAssetUrl);
  validateDeclarations(root, { scope, target });

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
    if (typeof loadImport !== "function") {
      throw new TypeError(`Theme CSS import cannot be loaded: ${specifier}.`);
    }
    const imported = await loadImport(specifier, sourcePath);
    const importedCss = typeof imported === "string" ? imported : imported?.css;
    const importedSourcePath = typeof imported === "string" ? specifier : imported?.sourcePath;
    if (typeof importedCss !== "string" || typeof importedSourcePath !== "string") {
      throw new TypeError(`Theme CSS import did not return text: ${specifier}.`);
    }
    if (ancestry.includes(importedSourcePath)) {
      throw new TypeError(`Theme CSS import cycle detected at ${importedSourcePath}.`);
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

function scopeRules(root, { themeId, target, scope }) {
  const host = scope === "surface-overlay"
    ? `[data-po-theme-surface="${target}"][data-po-theme-id]`
    : `[data-po-theme-surface="${target}"][data-po-theme-id="${themeId}"]`;
  root.walkRules((rule) => {
    const selectors = splitSelectors(rule.selector);
    const scoped = selectors.map((selector) => scopeSelector(selector, host, target));
    if (target === "application") {
      const rootOnly = selectors.every((selector) => isApplicationRootSelector(selector));
      if (!rootOnly) {
        throw new TypeError("Application themes may only declare root-level --po-* tokens.");
      }
    }
    rule.selector = scoped.join(", ");
  });
}

function scopeSelector(selector, host, target) {
  const normalized = selector.trim();
  if (!normalized) throw new TypeError("Theme CSS contains an empty selector.");
  if (normalized.includes(":global(") || normalized.includes(":host") || normalized.includes("::part")) {
    throw new TypeError(`Theme CSS selector can escape its surface: ${normalized}.`);
  }

  const darkRoot = parseDarkRootSelector(normalized);
  if (darkRoot) {
    assertRootSuffixRemainsScoped(darkRoot.suffix, normalized);
    if (target === "application" && darkRoot.suffix.length === 0) return `${host}:where(.dark)`;
    return `:where(.dark) ${host}${darkRoot.suffix}`;
  }

  const alias = rootAliases.find((candidate) => startsWithSelectorToken(normalized, candidate));
  if (!alias) {
    if (containsRootAlias(normalized)) {
      throw new TypeError(`Theme CSS root aliases must start the selector: ${normalized}.`);
    }
    assertRootSuffixRemainsScoped(` ${normalized}`, normalized);
    return `${host} ${normalized}`;
  }

  const suffix = normalized.slice(alias.length);
  if (containsRootAlias(suffix)) {
    throw new TypeError(`Theme CSS selector contains more than one root alias: ${normalized}.`);
  }
  if (target === "application" && suffix === ".dark") {
    return `${host}:where(.dark)`;
  }
  assertRootSuffixRemainsScoped(suffix, normalized);
  return `${host}${suffix}`;
}

function assertRootSuffixRemainsScoped(suffix, selector) {
  let depth = 0;
  let quote = null;
  for (let index = 0; index < suffix.length; index += 1) {
    const character = suffix[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === "/" && suffix[index + 1] === "*") {
      const end = suffix.indexOf("*/", index + 2);
      index = end < 0 ? suffix.length : end + 1;
      continue;
    }
    if (character === "(" || character === "[") {
      depth += 1;
      continue;
    }
    if (character === ")" || character === "]") {
      depth -= 1;
      continue;
    }
    if (depth !== 0) continue;
    if (/\s/.test(character)) {
      let next = index + 1;
      while (next < suffix.length) {
        if (/\s/.test(suffix[next])) {
          next += 1;
        } else if (suffix[next] === "/" && suffix[next + 1] === "*") {
          const end = suffix.indexOf("*/", next + 2);
          next = end < 0 ? suffix.length : end + 2;
        } else {
          break;
        }
      }
      if (suffix[next] === "+" || suffix[next] === "~" || suffix.slice(next, next + 2) === "||") {
        throw new TypeError(`Theme CSS selector can escape its surface: ${selector}.`);
      }
      return;
    }
    if (character === "+" || character === "~" || suffix.slice(index, index + 2) === "||") {
      throw new TypeError(`Theme CSS selector can escape its surface: ${selector}.`);
    }
    if (character === ">") return;
  }
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

function validateDeclarations(root, { scope, target }) {
  root.walkDecls((declaration) => {
    const property = declaration.prop.toLowerCase();
    const value = declaration.value.trim().toLowerCase();
    if (scope === "theme" && declaration.important) {
      throw new TypeError("Theme CSS cannot use !important; cascade precedence is managed by PuppyOne.");
    }
    if (target === "application" && !property.startsWith("--po-")) {
      throw new TypeError("Application themes may only declare root-level --po-* tokens.");
    }
    if (target === "application" && !applicationColorTokens.has(property)) {
      throw new TypeError("Application themes may only declare public color tokens.");
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
  const value = params.trim();
  const quoted = value.match(/^(?:"([^"]+)"|'([^']+)')$/);
  if (quoted) return quoted[1] ?? quoted[2];
  const url = value.match(/^url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s"')]+))\s*\)$/i);
  return url ? url[1] ?? url[2] ?? url[3] : null;
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

function isApplicationRootSelector(selector) {
  const normalized = selector.trim();
  if (isRootOnlySelector(normalized)) return true;
  if (rootAliases.some((alias) => normalized === `${alias}.dark`)) return true;
  const darkRoot = parseDarkRootSelector(normalized);
  return Boolean(darkRoot && darkRoot.suffix.length === 0);
}

function parseDarkRootSelector(selector) {
  if (!selector.startsWith(".dark ")) return null;
  const nested = selector.slice(".dark ".length).trimStart();
  const alias = rootAliases.find((candidate) => startsWithSelectorToken(nested, candidate));
  if (!alias) return null;
  const suffix = nested.slice(alias.length);
  if (containsRootAlias(suffix)) {
    throw new TypeError(`Theme CSS selector contains more than one root alias: ${selector}.`);
  }
  return { suffix };
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
